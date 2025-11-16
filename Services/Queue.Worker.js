const { Worker } = require('bullmq')
const virusScanWorker = new Worker('virusScanQueue' , async (job)=>{
    const {uniqueFileID , userId , fileNameOnServer , filePath , fileSize , fileMimeType , shared_with , visibilty , original_name} = job
},
{
    connection:{
        host:process.env.REDIS_HOST,
        port:process.env.REDIS_PORT,
        password:process.env.REDIS_PASSWORD,
        username:process.env.REDIS_USERNAME
    },
    concurrency:process.env.QUEUE_WORKER_CONCURRENCY
})