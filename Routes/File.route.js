const express = require('express')
const router = express.Router()
const path = require('path')
const fs = require('fs')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const verifyToken = require('../Utils Service/TokenVerify')
const pool = require('../SQL Server/Database')
const crypto = require('crypto')
const { redis: redisClient } = require('../Utils Service/Redis.utils')
const generateUniqueRandomId = require('../Utils Service/IDGenerate.utils')
const { diskUpload, memoryUpload } = require('../Utils Service/Multer.utils')
const publishOnChannel = require('../Services/Redis.publisher')

/**
 * 
 * @param {Object} payload 
 * @returns {Object}
 */

function generateDigitalSign(payload = {}) {
    const signature = crypto.createHmac('sha256', process.env.CRYPTO_SERVER_SECRET).update(JSON.stringify(payload)).digest('hex')
    return { status: true, signature }
}

/**
 * 
 * @param {String} uid 
 * @param {String} signature 
 * @param {String} signedURL 
 */
async function saveToRedis(uid = '', signature = '', signedURL = '') {
    try {
        await redisClient.set(`user:${uid}:${signedURL}`, signature)
        await redisClient.expire(`user:${uid}:${signedURL}`, 300)
    } catch (error) {
        console.log(`Error While Setting Up Key Value For Signed URL ${error.message}`)
    }
}

/**
 * 
 * @param {String} uid 
 * @param {String} signedURL 
 * @returns {Object}
 */
async function getFromRedis(uid = '', signedURL = '') {
    try {
        const data = await redisClient.get(`user:${uid}:${signedURL}`)
        console.log(`Data from Redis ${data}`)
        if (data)
            return { status: true, data }

        throw new Error("Invalid Key Or Key is Expired")
    }
    catch (error) {
        console.log(error.message) 
        return { status: false, reason: error.message }
    }
}

async function removeFromRedis(uid = '', signedURL = '') {
    try {
        await redisClient.del(`user:${uid}:${signedURL}`)
        return { status: true, message: "Redis Key Deleted" }
    }
    catch (error) {
        console.log('Error While Deleting Key From Redis')
        return { status: false, reason: error.message }
    }
}

/**
 * 
 * @param {Object} payload 
 * @param {String} signature 
 * @returns {Object}
 */
function generateSignedURL(payload = {}, signature = '') {
    const signedURL = `http://localhost:3000/api/file/file-access?uid=${encodeURIComponent(payload.uid)}&path=${encodeURIComponent(payload.path)}&op=${encodeURIComponent(payload.op)}&exp=${encodeURIComponent(payload.exp)}&signature=${encodeURIComponent(signature)}`
    return { status: true, signedURL }
}

async function validateData(redisSignature, payload) {
    let connection;
    try {

        connection = await pool.getConnection()
        await connection.query('USE MINI_S3_BUCKET')
        const [rows, fields] = await connection.execute('SELECT api_secret_hash FROM api_keys WHERE user_id = ?', [payload.uid])

        const payloadForSign = {     // Issue was payload at time of sign was different at time of verification even though they look similar but their structure
            path: payload.filePath,   // was different
            op: payload.op,
            exp: Number(payload.exp),     // Crypto ("123") != Crypto(123) String != Number
            uid: payload.uid,
            api_secret_hash: rows[0].api_secret_hash
        }

        const { status, signature } = generateDigitalSign(payloadForSign)
        console.log(`Sign verify ${signature} redis ${redisSignature}`)

        if (signature !== redisSignature)
            return { status: false, reason: "Signature Invalid While Cross Check With Database" }
        return { status: true, message: "Signatured Verified" }
    }
    catch (error) {
        console.log(`Error While Signature Verification With Cross Check With Database ${error.message}`)
        return { status: false, reason: `Error While Signature Verification With Cross Check With Database ${error.message}` }
    }
    finally {
        if (connection)
            connection.release()
    }
}

router.get('/', (req, res) => {
    return res.status(202).json({
        status: true,
        message: "File.route.js is Working Fine"
    })
})

router.post('/generate-sign-url', verifyToken, async (req, res) => {

    const { fileName, operation, api_key } = req.body
    console.log(fileName, operation)

    if (!fileName || !operation || (operation.toLowerCase() !== 'upload' && operation.toLowerCase() !== 'download') || !api_key) {
        return res.status(401).json({
            status: false,
            message: "File Name and Operation For The File is Required and API_KEY"
        })
    }

    let connection;
    try {
        connection = await pool.getConnection()
        await connection.query('USE MINI_S3_BUCKET')

        const [rows, fields] = await connection.query('SELECT api_secret_hash FROM api_keys WHERE api_key = ?', [api_key])
        const filePath = `uploads/${req.user._id}`

        const payload = {
            path: filePath,
            op: operation,
            exp: Date.now() + 1000 * 300,    // 5 Minutes,
            uid: req.user._id,
            api_secret_hash: rows[0].api_secret_hash
        }

        // Create Digital Signature Using CryptoGraphy For Signed URL
        const { status, signature } = generateDigitalSign(payload)

        // Generate Signed Url And Send to Frontend
        const { urlStatus, signedURL } = generateSignedURL(payload, signature)
        await saveToRedis(payload.uid, signature, signedURL)

        return res.status(200).json({
            status: true,
            message: "Signed URL Generated Successfuly",
            expireAfter: "5 Minutes",
            signedURL: signedURL,
            digitalSignature: signature
        })
    }
    catch (error) {
        console.log(`Error While Fetching API_SECRET_HASH For Signed URL ${error.message}`)
        return res.status(501).json({
            status: false,
            message: `Error While Fetching API_SECRET_HASH For Signed URL ${error.message}`
        })
    }
    finally {
        if (connection)
            connection.release()
    }
})

router.post('/file-access', verifyToken, diskUpload.single('file'), async (req, res) => {

    console.log(req.file)
    if (!req.file) {
        return res.status(401).json({
            status: false,
            message: "No File is Found in Our Backend"
        })
    }

    const { uid, op, path: filePath, exp, signature } = req.query
    if (!uid || !op || !path || !exp || !signature) {
        return res.status(401).json({
            status: false,
            message: "All Field Of Signed URL is Required For Validation"
        })
    }

    //  Fetch Signature form Redis 
    const { status, data, reason } = await getFromRedis(uid, `http://localhost:3000${req.originalUrl}`)
    if (!status) {
        if (fs.existsSync(req.file.path))
            fs.unlinkSync(req.file.path)

        if (fs.existsSync(path.join(__dirname, '..', filePath))) {
            fs.rmSync(path.join(__dirname, '..', filePath), { recursive: true, force: true })
        }
        return res.status(401).json({
            status: false,
            message: reason
        })
    }

    // Valdate Redis Signature and URL Signature and Database Signature 
    const { status: validationStatus, reason: validationReason, message } = await validateData(data, { filePath, op, exp, uid })
    if (!validationStatus) {

        if (fs.existsSync(req.file.path))
            fs.unlinkSync(req.file.path)

        if (fs.existsSync(path.join(__dirname, '..', filePath))) {
            fs.rmSync(path.join(__dirname, '..', filePath), { recursive: true, force: true })
        }

        return res.status(401).json({
            status,
            validationReason
        })
    }

    // Save to Database The File Has Been Recorded On Server
    let connection;
    try {
        const { status, _id: uniqueFileID } = generateUniqueRandomId()
        connection = await pool.getConnection()
        await connection.query('USE MINI_S3_BUCKET')

        const sqlQuery = `INSERT INTO files (id,user_id,filename,storage_path,size,mime_type,shared_with,visibilty,original_name,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)`
        const [rows, fields] = await connection.execute(sqlQuery, [uniqueFileID, req.user._id, req.file.filename, req.file.path, req.file.size, req.file.mimetype, JSON.stringify({}), 'private', req.file.originalname, Date.now()])

        // Remove Key From Cache Server Dont Make it Await Ye Yar normal process h
        removeFromRedis(req.user._id, `http://localhost:3000${req.originalUrl}`)

        // Public The Current File Transaction Into Redis Pub Sub Model
        publishOnChannel('virusScan' , rows[0])

        if (rows.affectedRows === 0) {
            return res.status(501).json({
                status: false,
                message: "SQL Server Issue In Insertion Of File Data"
            })
        }

        return res.status(200).json({
            status: true,
            message: "File Inserted On The Server",
            rows
        })
        // future processing
    }
    catch (error) {
        console.log(`SQL Server Issue in Insertion of File Data ${error.message}`)
        if (fs.existsSync(req.file.path))
            fs.unlinkSync(req.file.path)

        if (fs.existsSync(path.join(__dirname, '..', filePath))) {
            fs.rmSync(path.join(__dirname, '..', filePath), { recursive: true, force: true })
        }

        return res.status(501).json({
            status: false,
            reason: `SQL Server Issue in Insertion of File Data ${error.message}`
        })
    }
    finally {
        if (connection)
            connection.release()
    }
})

router.post('/getFiles', verifyToken, async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection()
        await connection.query('USE MINI_S3_BUCKET')

        // Find All Files Of Client
        const [rows, fields] = await connection.query('SELECT *FROM files WHERE user_id = ?', [req.user._id])
        console.log(rows.length)
        console.log(rows)
        return res.status(200).json({
            status: true,
            message: "Data is Array of Object Use [] Operator For Efficeny & Accuracy",
            data: rows
        })
    }
    catch (error) {
        console.log(`Error While Fetching The All Files Data From Server ${error.message}`)
        return res.status(501).json({
            status: false,
            reason: `Internal Server Error ${error.message}`
        })
    }
    finally {
        if (connection)
            connection.release()
    }
})

router.post('/download', verifyToken, async (req, res) => {
    const { storagePath, origialName, id } = req.body
    if (!storagePath || !id) {
        return res.status(401).json({
            status: false,
            message: "ID or Storage Path is Mandtory Aspect"
        })
    }

    // Check Storage Path With Storage Path in Database
    let connection;
    try {
        connection = await pool.getConnection()
        await connection.query('USE MINI_S3_BUCKET')

        const [rows, fields] = await connection.query('SELECT storage_path FROM files WHERE id = ?', [id])
        if (rows[0].storage_path !== storagePath) {
            return res.status(401).json({
                status: false,
                message: "Storage Path Does Not Match With Database"
            })
        }

        // Check For File Existence
        if (!fs.existsSync(storagePath)) {
            return res.status(401).json({
                status: false,
                message: "File is Either Corrupted Or Contains Virus So We Have Removed It"
            })
        }

        res.download(storagePath, origialName, (err) => {
            if (err) {
                console.log(err.message)
                return res.status(500).json({
                    status: false,
                    message: "Could not download file"
                })
            }
        })
    }
    catch (error) {
        console.error(error)
        return res.status(500).json({
            status: false,
            message: "Internal server error"
        })
    }
    finally{
        if(connection)
            connection.release()
    }
})

router.delete('/delete' , verifyToken, async (req,res)=>{
    const {id , storagePath} = req.body
    if(!id || !storagePath){
        return res.status(401).json({
            status:false,
            message:"No Storage Path is Provided For Deletion"
        })
    }

    // Check this storage path with db storage path
    let connection;
    try{
        connection = await pool.getConnection()
        connection.quer('USE MINI_S3_BUCKET')

        const [rows , fields] = await connection.query('SELECT storage_path FROM files WHERE id = ?' , [id])
        if(rows.length === 0){
            return res.status(202).json({
                status:true,
                message:"At Time of Virus Scanning We Found Some Issue So File Has Been Removed Early"
            })
        }

        if(storagePath !== rows[0].storage_path){
            return res.status(401).json({
                status:false,
                message:"Storage Path You Provided is Not Valid"
            })
        }

        // Check if file Exits in Server or Not
        if(fs.existsSync(rows[0].storage_path)){
            fs.unlinkSync(rows[0].storage_path)
            return res.status(202).json({
                status:true,
                message:"File Has Been Deleted Successfuly From The Server"
            })
        }
    }
    catch(error){
        console.log(`Error While File Deletion From The Server`)
        return res.status(501).json({
            status:false,
            message:`File Deletion Failed Reason ${error.message}`
        })
    }
    finally{
        if(connection)
            connection.release()
    }
})

module.exports = router