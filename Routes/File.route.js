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

/**
 * 
 * @param {string} redisSignature 
 * @param {Object} payload 
 * @returns Boolean
 */
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

function generateShareURL(payload) {
    const shareURL = `http://localhost:3000/api/file/download?shareByID=${encodeURIComponent(payload.shareByID)}&shareFileID=${encodeURIComponent(payload.shareFileID)}&shareFilePath=${encodeURIComponent(payload.shareFilePath)}&shareWithEmail=${encodeURIComponent(payload.shareWithEmail)}&shareWithID=${encodeURIComponent(payload.shareWithID)}`
    return { status: true, shareableURL: shareURL }
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
        const [rows, fields] = await connection.execute(sqlQuery, [uniqueFileID, req.user._id, req.file.filename, req.file.path, req.file.size, req.file.mimetype, JSON.stringify({}), 'public', req.file.originalname, Date.now()])

        // Remove Key From Cache Server Dont Make it Await Ye Yar normal process h
        removeFromRedis(req.user._id, `http://localhost:3000${req.originalUrl}`)

        // Public The Current File Transaction Into Redis Pub Sub Model
        const payloadForRedisModel = {
            name: "virusScan",
            uniqueFileID: uniqueFileID,
            userId: req.user._id,
            fileNameOnServer: req.file.filename,
            filePath: req.file.path,
            fileMimeType: req.file.mimetype,
            shared_with: JSON.stringify({}),
            visibilty: 'public',
            original_name: req.file.originalname,
            createdAt: Date.now()
        }

        Object.seal(payloadForRedisModel) // Object Seal for Server Security
        publishOnChannel("virusAndMailService", JSON.stringify(payloadForRedisModel))

        if (rows.affectedRows === 0) {
            return res.status(501).json({
                status: false,
                message: "SQL Server Issue In Insertion Of File Data"
            })
        }

        return res.status(200).json({
            status: true,
            message: "File Inserted On The Server",
            rows,
            uniqueFileID: uniqueFileID,
            userId: req.user._id,
            fileNameOnServer: req.file.filename,
            filePath: req.file.path,
            fileMimeType: req.file.mimetype,
            shared_with: JSON.stringify({}),
            visibilty: 'public',
            original_name: req.file.originalname,
            createdAt: Date.now()
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
    const queryURL = req.query

    if (((storagePath && id) || queryURL) === false) {
        return res.status(401).json({
            status: false,
            message: "ID and Storage Path or queryURL is Mandtory Aspect"
        })
    }

    let connection;
    if (storagePath && id) {
        // Check Storage Path With Storage Path in Database
        try {
            connection = await pool.getConnection()
            await connection.query('USE MINI_S3_BUCKET')

            const [rows, fields] = await connection.query('SELECT storage_path FROM files WHERE id = ?', [id])
            if (rows.length === 0) {
                return res.status(404).json({
                    status: false,
                    message: "File Record Not Found"
                })
            }

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

            res.download(storagePath, origialName || "download-file", (err) => {
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
        finally {
            if (connection)
                connection.release()
        }
    }
    else {
        try {
            const { shareByID, shareFileID, shareFilePath, shareWithEmail, shareWithID } = queryURL

            if (!fs.existsSync(path.join(__dirname, '..', shareFilePath))) {
                return res.status(401).json({
                    status: false,
                    message: "File is Deleted By The Owner Or File is Not Available On The Server"
                })
            }

            connection = await pool.getConnection()
            connection.query("USE MINI_S3_BUCKET")

            const [rows, fields] = await connection.query('SELECT shared_with FROM files WHERE user_id = ?', [shareByID])
            if (rows.length === 0) {
                return res.status(401).json({
                    status: false,
                    message: "No File Data are Available Of The Sharing User in Our Database"
                })
            }

            console.log(typeof rows[0].shared_with)
            console.log(rows[0].shared_with)

            let parsedArray;
            try {
                if (Array.isArray(rows[0].shared_with))
                    parsedArray = rows[0].shared_with
                else if (typeof rows[0].shared_with === "object" && rows[0].shared_with !== null)
                    parsedArray = rows[0].shared_with
                else if (typeof rows[0].shared_with === "string")
                    parsedArray = JSON.parse(rows[0].shared_with)
                if (!Array.isArray(parsedArray)) parsedArray = [];
            }
            catch (error) {
                parsedArray = []
            }

            if (parsedArray.length === 0) {
                return res.status(401).json({
                    status: false,
                    message: "Permission To File Share To You is Revoked"
                })
            }

            let isPermit = parsedArray.some((item, index, arr) => {
                return item.shareFileID === shareFileID && item.shareFilePath === shareFilePath && item.shareWithEmail === shareWithEmail
            })

            if (!isPermit) {
                return res.status(401).json({
                    status: false,
                    message: "Permission To File Share To You is Revoked !Permit"
                })
            }

            res.download(path.join(__dirname, '..', shareFilePath), origialName || "download-file", (err) => {
                if (err) {
                    console.log(err.message)
                    return res.status(500).json({
                        status: false,
                        message: "Could not download File Try After Sometime"
                    })
                }
            })
        }
        catch (error) {
            console.log(`Error in Downloading File From Server`)
            return res.status(500).json({
                status: false,
                message: `Error in Downloading File From Server ${error.message}`
            })
        }
        finally {
            if (connection)
                connection.release()
        }
    }
})

router.delete('/delete', verifyToken, async (req, res) => {
    const { id, storagePath } = req.body
    if (!id || !storagePath) {
        return res.status(401).json({
            status: false,
            message: "No Storage Path is Provided For Deletion"
        })
    }

    // Check this storage path with db storage path
    let connection;
    try {
        connection = await pool.getConnection()
        connection.query('USE MINI_S3_BUCKET')

        const [rows, fields] = await connection.query('SELECT storage_path FROM files WHERE id = ?', [id])
        if (rows.length === 0) {
            return res.status(202).json({
                status: true,
                message: "At Time of Virus Scanning We Found Some Issue So File Has Been Removed Early"
            })
        }

        if (storagePath !== rows[0].storage_path) {
            return res.status(401).json({
                status: false,
                message: "Storage Path You Provided is Not Valid"
            })
        }

        // Check if file Exits in Server or Not
        if (fs.existsSync(rows[0].storage_path)) {
            fs.unlink(rows[0].storage_path , ()=>{})
            return res.status(202).json({
                status: true,
                message: "File Has Been Deleted Successfuly From The Server"
            })
        }
    }
    catch (error) {
        console.log(`Error While File Deletion From The Server`)
        return res.status(501).json({
            status: false,
            message: `File Deletion Failed Reason ${error.message}`
        })
    }
    finally {
        if (connection)
            connection.release()
    }
})

router.post('/shareWith', verifyToken, async (req, res) => {
    const { emailToShareWith, fileID, filePath } = req.body
    if (!emailToShareWith || !fileID || !filePath) {
        return res.status(401).json({
            status: false,
            message: "No Email is Provided or FileID or FilePath To Share With"
        })
    }

    if (!fs.existsSync(path.join(__dirname, '..', filePath))) {
        return res.status(401).json({
            status: false,
            message: "This File Contains The Virus And Deleted From The Server So Cannot Be Share"
        })
    }

    let connection;

    try {
        connection = await pool.getConnection()
        connection.query('USE MINI_S3_BUCKET')

        await connection.beginTransaction()
        const [row, field] = await connection.query(`SELECT users.id as id FROM users WHERE email = ?`, [emailToShareWith])

        if (row.length === 0 || !row[0].id) {
            await connection.rollback()
            return res.status(401).json({
                status: false,
                message: "No User is Available With This Email"
            })
        }

        const [rows, fields] = await connection.query('SELECT shared_with FROM files WHERE user_id = ?', [req.user._id])
        let parsedArray;

        try {
            parsedArray = JSON.parse(rows[0].shared_with)
            if (!Array.isArray(parsedArray)) parsedArray = []
        } catch {
            parsedArray = []
        }

        const alreadyPresent = parsedArray.some((item, index, arr) => {
            return item.shareFileID === fileID
        })

        if (alreadyPresent) {
            await connection.rollback()
            return res.status(200).json({
                status: true,
                message: "File is Already Shared"
            })
        }

        const payload = {
            shareByID: req.user._id,
            shareFileID: fileID,
            shareFilePath: filePath,
            shareWithEmail: emailToShareWith,
            shareWithID: row[0].id
        }

        Object.seal(payload)   // Seal Object For Server Security
        parsedArray.push(payload)

        console.log(parsedArray)
        const [updateData] = await connection.query('UPDATE files SET shared_with = ? where user_id = ?', [JSON.stringify(parsedArray), req.user._id])

        if (updateData.affectedRows === 0) {
            console.log('Data Not Updated On The Database')
            return res.status(202).json({
                status: false,
                message: "Data is Not Updated on Database For Sharing"
            })
        }

        await connection.commit()
        const { status, shareableURL } = generateShareURL(payload)

        const payloadForEmail = {
            name: "mailSend",
            operation: "Shared",
            shareByEmail: req.user.email,
            shareWithEmail: emailToShareWith,
            shareName:req.user.name
        }

        await publishOnChannel('virusAndMailService' , JSON.stringify(payloadForEmail))
        return res.status(200).json({
            status: true,
            message: "File Shared With User",
            shareableURL,
            sharedWithID:row[0].id
        })
    }
    catch (error) {
        console.log(`Error While File Sharing ${error.message}`)
        await connection.rollback()

        return res.status(501).json({
            status: false,
            message: `Internal Server Error ${error.message}`
        })
    }
    finally {
        if (connection)
            connection.release()
    }
})

router.post('/removeShare', verifyToken, async (req, res) => {

    const { sharedWithEmail, sharedWithId } = req.body
    if (!sharedWithEmail || !sharedWithId) {
        return res.status(401).json({
            status: false,
            message: "Shared With Email and Her ID is Required"
        })
    }

    let connection;
    try {
        connection = await pool.getConnection()
        connection.query('USE MINI_S3_BUCKET')

        connection.beginTransaction()
        const [rows, fields] = await connection.query(`SELECT shared_with FROM files WHERE user_id = ?`, [req.user._id])

        let parsedArray;
        if (Array.isArray(rows[0].shared_with)) {
            parsedArray = rows[0].shared_with
        }
        else if (typeof rows[0].shared_with === 'object' || rows[0].shared_with !== null) {
            parsedArray = rows[0].shared_with
        }
        else if (typeof rows[0].shared_with === 'string') {
            parsedArray = rows[0].shared_with
        }


        // Time Complexity is O(N^2) Future Improvement Can Be Done By Database Normalization To Time Complexity O(logn)
        for (let i = 0; i < parsedArray.length; i++) {
            if (parsedArray[i].shareWithEmail == sharedWithEmail && parsedArray[i].shareWithID == sharedWithId) {
                parsedArray.splice(i, 1)

                await connection.query('UPDATE files SET shared_with = ? WHERE user_id = ?', [JSON.stringify(parsedArray), req.user._id])
                await connection.commit() // Comit Changes To Database

                const payloadForEmail = {
                    name: "mailSend",
                    operation: "Revoked",
                    shareByEmail: req.user.email,
                    shareWithEmail: sharedWithEmail,
                    shareName:req.user.name
                }

                publishOnChannel('virusAndMailService' , JSON.stringify(payloadForEmail))

                return res.status(200).json({
                    status: true,
                    message: "Shared User Removed From List"
                })
            }
        }

        await connection.rollback()   // RollBack To Previous State Data Consistency
        return res.status(401).json({
            status: false,
            message: "Not Able To Delete The Shared User From Database Due To Email to Which Data is Shared is Revoked"
        })
    }
    catch (error) {
        await connection.rollback() // RollBack To Previous State Data Consistency
        console.log(`Error While Removing Shared User From Database ${error.message}`)
        return res.status(500).json({
            status: false,
            message: error.message
        })
    }
})

router.get('/:fileID' , verifyToken , async(req,res)=>{
    const fileID = req.params.fileID
    if(!fileID){
        return res.status(401).json({
            status:false,
            message:"FileID is Mandatory Paramtere"
        })
    }

    let connection;
    try{
        connection = await pool.getConnection()
        connection.query("USE MINI_S3_BUCKET")

        const [rows , fields] = await connection.query("SELECT *FROM files WHERE id = ?" , [fileID])
        return res.status(200).json({
            status:true,
            rows,
            message:"Data Retrived"
        })
    }
    catch(error){
        console.log(`Error in File Info Get`)
        fs.writeFile(path.join(__dirname, '..' , 'metrix.txt') , error.message + '\n' , {
            encoding:'utf-8'
        })

        return res.status(500).json({
            status:false,
            message:"Internal Server Error"
        })
    }
    finally{
        if(connection)
            connection.release()
    }
})

router.delete('/delete' , verifyToken , async (req,res)=>{
    const {storagePath , id} = req.body
    if(!storagePath || !id){
        return res.status(401).json({
            statsus:false,
            message:"Storage Path and File Id Is Required"
        })
    }

    if(!fs.existsSync(path.join(__dirname , '..' , storagePath))){
        return res.status(202).json({
            status:true,
            message:"File Contains A Virus Deleted From Server"
        })
    }

    try{
        fs.unlinkSync(path.join(__dirname , '..' , storagePath))
        return res.status(200).json({
            status:true,
            message:"File is Removed From Server"
        })
    }
    catch(error){
        console.log(`Error While Deleting The File ${error.message}`)
        return res.status(500).json({
            status:false,
            message:`Error While Deleting The File ${error.message}`
        })
    }
})

module.exports = router
