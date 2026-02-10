const { Worker } = require('bullmq')
const { scanFileWithVirusTotal, getAnalysisReport } = require('./VirusTotal.scan')
const pool = require('../SQL Server/Database')
const fs = require('fs')
const path = require('path')
const generateUniqueRandomId = require('../Utils Service/IDGenerate.utils')
const transporter = require('../Utils Service/NodeMailer.mail')

require('dotenv').config({
    path: path.join(__dirname, '..', '.env')
})

const virusScanWorker = new Worker('virusScanQueue', async (job) => {

    const { uniqueFileID, userId, fileNameOnServer, filePath, fileSize, fileMimeType, shared_with, visibilty, original_name, createdAt } = await job.data
    const analysisId = await scanFileWithVirusTotal(filePath)
    let connection;

    if (analysisId) {
        try {
            const { date, stats } = await getAnalysisReport(analysisId)
            connection = await pool.getConnection()

            connection.query('USE MINI_S3_BUCKET')
            const { _id: analysisUnqiueId } = generateUniqueRandomId()
            const status = (stats.malicious > 0 || stats.suspicious ? 'dangerous' : 'safe')

            const [rows] = await connection.query(`INSERT INTO analysis(id, file_id, user_id, date_scan, stats, analysisId , status) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
                analysisUnqiueId,
                uniqueFileID,
                userId,
                date.toString(),
                JSON.stringify(stats),
                analysisId,
                status
            ])

            console.log(rows, stats)
            if (status === 'dangerous') {
                await fs.unlink(path.join(__dirname, '..', filePath))
                status = 'dangerous'
                date = Date.now()
                const [rows] = await connection.query(`INSERT INTO analysis(id, file_id, user_id, date_scan, stats, analysisId , status) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
                    analysisUnqiueId,
                    uniqueFileID,
                    userId,
                    date,
                    JSON.stringify({}),
                    analysisId,
                    status
                ])
                console.log("File Removed From Server Due To Malicious File or Suspicious File")
                return
            }


            if (rows.affectedRows === 0) {
                console.log('Not Able to Store The Analysis Report on Database')
                // Append FailOver Mechanism 
            }
        }
        catch (error) {
            console.log(`Error While Query to SQL To Save File Report Data ${error.message}`)
            let status = 'dangerous'
            let date = Date.now()
            const [rows] = await connection.query(`INSERT INTO analysis(id, file_id, user_id, date_scan, stats, analysisId , status) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
                analysisUnqiueId,
                uniqueFileID,
                userId,
                date,
                JSON.stringify({}),
                analysisId,
                status
            ])
            throw new Error(error.message)
            // Append FailOver Mechanism
        }
        finally{
            if(connection){
                connection.release()
            }
        }
    }
},
    {
        connection: {
            host: process.env.REDIS_HOST,
            port: process.env.REDIS_PORT,
            password: process.env.REDIS_PASSWORD,
            username: process.env.REDIS_USERNAME
        },
        concurrency: parseInt(process.env.QUEUE_WORKER_CONCURRENCY) || 1,
        autorun: true
    })

const mailWorker = new Worker('mailQueue', async (job) => {
    const { operation, shareByEmail, shareWithEmail, shareableURL, shareName } = await job.data
    try {
        if (operation == 'Shared') {
            const sendMail = await transporter.sendMail({
                from: "Arjun Singh Negi <no-reply@aaju.dev.com>",
                to: shareWithEmail,
                subject: `A File Share By ${shareWithEmail} Name ${shareName}`,
                html: `
                    <div style="font-family: Arial; padding: 10px;">
                        <h2>📁 New File Shared With You</h2>

                        <p><strong>${shareByEmail}</strong> has shared a file with 
                        <strong>${shareWithEmail}</strong>.</p>

                        <p>Click below to open:</p>

                        <a href="${shareableURL}" 
                        style="padding: 10px 15px; background: #4CAF50; color: white; 
                                text-decoration: none; border-radius: 5px;">
                            Open File
                        </a>

                        <br><br>

                        <small style="color: #555;">
                            Sent by MiniS3 File Sharing Service
                        </small>
                    </div>
                `
            })
        }
        else {
            await transporter.sendMail({
                from: `MiniS3 Service <no-reply@minis3.com>`,
                to: shareWithEmail,
                subject: "Access Revoked - MiniS3",
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 15px;">
                        <h2 style="color: #d9534f;">Access Revoked</h2>

                        <p>Hello,</p>

                        <p>The file owner <strong>${shareByEmail}</strong> has revoked your access to a previously shared file.</p>

                        <p style="margin-top:20px;">
                            <strong>Your access to this file has been revoked.</strong>
                        </p>

                        <p>If you believe this was a mistake, please contact the file owner.</p>

                        <br>

                        <small style="color:#777;">This message was sent by MiniS3 File Sharing Service.</small>
                    </div>
                `
            })
        }
    }
    catch (error) {
        console.log(`Error While Sending The Mail To User Retry Throwed Error To Parent Process ${error}`)
        throw new Error(error.message || "Error While Sending The Mail To User Retry Throwed Error To Parent Process")
    }
    finally{
        
    }
},
    {
        connection: {
            host: process.env.REDIS_HOST,
            port: process.env.REDIS_PORT,
            password: process.env.REDIS_PASSWORD,
            username: process.env.REDIS_USERNAME
        },
        concurrency: parseInt(process.env.QUEUE_WORKER_CONCURRENCY) || 1
    })