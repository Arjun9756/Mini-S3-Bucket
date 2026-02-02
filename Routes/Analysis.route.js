const express = require('express')
const path = require('path')
const router = express.Router()
const verifyToken = require('../Utils Service/TokenVerify')
const pool = require('../SQL Server/Database')
const fs = require('fs')

router.get('/analysisData' , verifyToken , async (req,res)=>{
    let connection;
    try{
        connection = await pool.getConnection()
        connection.query('USE MINI_S3_BUCKET')

        const [rows , fields] = await connection.query('SELECT *FROM analysis WHERE user_id = ?' , [req.user._id])
        
        return res.status(202).json({
            status:true,
            message:"Data Retrival For Analysis Of File",
            rows
        })
    }
    catch(error){
        console.log(`Error While Response Generation For Analaysis ${error.message}`)
        return res.status(501).json({
            status:false,
            message:`Error While Response Generation For Analaysis ${error.message}`
        })
    }
    finally{
        if(connection)
            connection.release()
    }
})

router.get('/:fileId' , verifyToken , async(req,res)=>{
    const fileId = req.params.fileId
    let connection;
    try{
        connection = await pool.getConnection()
        await connection.query("USE MINI_S3_BUCKET")

        const [rows , fields] = await connection.query("SELECT *FROM analysis WHERE file_id = ?" , [fileId])
        return res.status(200).json({
            status:true,
            message:"Data Retrival For Analysis Of File",
            rows
        })
    }
    catch(error){
        console.log(`Error in Analysis Of File ${error.message}`)
        fs.writeFile(path.join(__dirname , '..' , 'metrics.txt') , error.message + "\n" , {
            encoding:'utf-8'
        })
        return res.status(501).json({
            status:false,
            message:"File Has Been Removed From The Server As it Contains The Virus"
        })
    }
    finally{
        if(connection)
            connection.release()
    }
})

module.exports = router
