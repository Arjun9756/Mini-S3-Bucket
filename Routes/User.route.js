const express = require('express')
const router = express.Router()
const pool = require('../SQL Server/Database')
const generateUniqueRandomId = require('../Utils Service/IDGenerate.utils')
const bcrypt = require('bcryptjs')
const generateAPI_KEY_API_SECRET = require('../Utils Service/API_KEY_SECRET.utils')
const jwt = require('jsonwebtoken')
const verifyToken = require('../Utils Service/TokenVerify')

/**
 * @param {string} password 
 * @returns {Object} status , hashedPassword
 */
function hashMyPassword(password = '') {
    const hashPassword = bcrypt.hashSync(password, parseInt(process.env.BCRYPT_SALT) || 10)
    return { status: true, hashPassword }
}

/**
 * 
 * @param {string} _id 
 * @param {string} name 
 * @param {string} email 
 * @param {string} password 
 * @returns 
 */
function generateToken(_id, name, email) {
    try {
        const token = jwt.sign({ _id, name, email }, process.env.JWT_SECRET_KEY, { expiresIn: '48h', algorithm: process.env.JWT_HASH_ALGORITHM || "HS256" })
        return {status:true , token}
    }
    catch(error){
        return {status:false , reason:error.message}
    }
}

router.get('/', (req, res) => {
    return res.status(200).json({
        status: true,
        message: "User.register Route"
    })
})

router.post('/register', async (req, res) => {
    const { email, password, name } = req.body
    // If Email or Password Not Present Send Message To Client

    if (!email || !password) {
        return res.status(401).json({
            status: false,
            message: "Email or Password is Not Present"
        })
    }

    // Is Email Already Register Return Message To Client We Cannot Process This Request
    let connection;
    try {

        connection = await pool.getConnection()
        await connection.beginTransaction()
        await connection.query('USE MINI_S3_BUCKET')

        const [rows, fields] = await connection.query('SELECT *FROM users where email = ?', [email])
        if (rows.length > 0) {
            await connection.rollback()
            return res.status(409).json({
                status: false,
                message: "User is Already Register"
            })
        }

        // Hash The Password
        const hashedPassword = hashMyPassword(password).hashPassword

        // Creating User And ID For That
        const { _id: userUniqueID } = generateUniqueRandomId()
        const [result] = await connection.query('INSERT INTO users(id , email , name , password) VALUES (?, ?, ?, ?)', [userUniqueID, email, name || '', hashedPassword])

        // Generate Unique Valid API_KEY && API_SECRET Then Insert Data on API Table
        const { status, api_key, apiSecretHash, apiSecretRaw } = await generateAPI_KEY_API_SECRET()
        const { _id: apiUniqueID } = generateUniqueRandomId()

        const [apiInsertResult] = await connection.query('INSERT INTO api_keys(id , user_id , api_key , api_secret_hash , permission) VALUES (?,?,?,?,?)', [apiUniqueID, userUniqueID, api_key, apiSecretHash, JSON.stringify({ upload: true, download: true })])
        await connection.commit()

        return res.status(200).json({
            status: true,
            message: "User Registered Successfuly"
        })
    }
    catch (error) {

        console.log(`Error in SQL Execution ${error.message}`)
        if (connection)
            await connection.rollback()

        return res.status(501).json({
            status: false,
            message: "SQL Server Issue" + error.message,
        })
    }
    finally {
        if (connection)
            connection.release()
    }
})

// Login Logic
router.post('/login', async (req, res) => {

    const { email, password} = req.body
    console.log(email , password)
    if (!email || !password) {
        return res.status(401).json({
            status: false,
            message: "Email and Password Both Are Required"
        })
    }

    // Is User Already Present
    let connection;

    try {
        connection = await pool.getConnection()
        await connection.query('USE MINI_S3_BUCKET')

        const [rows, fields] = await connection.query('SELECT *FROM users WHERE email = ?', [email])
        if (rows.length === 0 || !bcrypt.compareSync(password , rows[0].password)) {
            return res.status(401).json({
                status: false,
                message: "Either The Email or Password is Wrong"
            })
        }

        // Generate Token For User
        const tokenResult = generateToken(rows[0].id , rows[0].name , rows[0].email)
        if(tokenResult.status === false){
            return res.status(501).json({
                status:false,
                message:tokenResult.reason
            })
        }

        // Get API Key and Secret And Send To Frontend
        const [apiRows] = await connection.query('SELECT users.id , users.name , users.email , users.email , api_keys.id as api_unique_id , api_keys.api_key , api_keys.api_secret_hash , api_keys.permission FROM users INNER JOIN api_keys ON users.id = api_keys.user_id where api_keys.user_id = ?' ,[rows[0].id])
        if(apiRows.length === 0){
            return res.status(501).json({
                status:false,
                message:"Something Went Wrong In Join Query Of Users and API Key"
            })
        }
         
        return res.status(200).json({
            status:true,
            message:"Keep This API Key And Secret Secure With Yours We Are Not Responsible For The Any Legal Compilances",
            userId:apiRows[0].id,
            name:apiRows[0].name,
            api_key:apiRows[0].api_key,
            api_secret_hash:apiRows[0].api_secret_hash,
            permission:apiRows[0].permission,
            token:tokenResult.token
        })
    }
    catch (error) {
        console.log(`Error in SQL Join Operation ${error.message}`)
        return res.status(501).json({
            status:false,
            message:`Error in SQL Join Operation ${error.message}`
        })
    }
    finally {
        if(connection)
            connection.release()
    }
})

router.delete('/delete' , verifyToken , async (req,res)=>{
    let connection;
    try{
        connection = await pool.getConnection()
        connection.query('USE MINI_S3_BUCKET')

        const [rows , fields] = await connection.query('DELETE FROM users WHERE id = ?' , [req.user._id])
        if(rows.affectedRows === 0){
            return res.status(501).json({
                status:false,
                message:"Error While Deleting The Current User"
            })
        }

        return res.status(200).json({
            status:true,
            message:"User Deleted Successfuly"
        })
    }
    catch(error){
        console.log(`Error in SQL Query  ${error.message}`)
        return res.status(501).json({
            status:false,
            message:`Internal Server Error in SQL ${error.message}`
        })
    }
    finally{
        if(connection)
            connection.release()
    }
})

module.exports = router