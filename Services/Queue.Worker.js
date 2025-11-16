const { Worker } = require('bullmq')
const { scanFileWithVirusTotal , getAnalysisReport } = require('./VirusTotal.scan')
const pool = require('../SQL Server/Database')
const fs = require('fs')
const generateUniqueRandomId = require('../Utils Service/IDGenerate.utils')

const virusScanWorker = new Worker('virusScanQueue' , async (job)=>{

    const {uniqueFileID , userId , fileNameOnServer , filePath , fileSize , fileMimeType , shared_with , visibilty , original_name} = job
    const {analysisId} = await scanFileWithVirusTotal(filePath)
    let connection;

    if(analysisId)
    {
        try{

            const {date , stats} = await getAnalysisReport(analysisId)
            connection = await pool.getConnection()
            
            connection.query('USE MINI_S3_BUCKET')
            const analysisUnqiueId = generateUniqueRandomId()

            if(stats.malicious > 0 || stats.suspicious > 0){
                const [rows , fields] = await connection.query(`INSERT INTO analysis(id,file_id,user_id,date_scan,stats,status)`,[analysisUnqiueId , uniqueFileID , userId , toString(date) , stats , "dangerous"])
                fs.unlinkSync(filePath)
                return
            }
            
            const [rows , fields] = await connection.query(`INSERT INTO analysis(id,file_id,user_id,date_scan,stats,status)`,[analysisUnqiueId , uniqueFileID , userId , toString(date) , stats , "safe"])
            if(rows.affectedRows === 0){
                console.log('Not Able to Store The Analysis Report on Database')
            }
        }
        catch(error){
            console.log(`Error While Query to SQL To Save File Report Data ${error.message}`)
            // Can't Return Anything It does not Make any sense
            throw new Error(error.message)
        }
    }
},
{
    connection:{
        host:process.env.REDIS_HOST,
        port:process.env.REDIS_PORT,
        password:process.env.REDIS_PASSWORD,
        username:process.env.REDIS_USERNAME
    },
    concurrency:process.env.QUEUE_WORKER_CONCURRENCY,
    autorun:true
})