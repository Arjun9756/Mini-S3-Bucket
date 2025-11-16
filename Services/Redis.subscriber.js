const { createClient } = require('../Utils Service/Redi.utils')
const { Queue, QueueEvents } = require('bullmq')
const fs = require('fs')
const path = require('path')
const subscriber = createClient()

// const thresholdValue = 1; // Bulk Processing

const virusScanQueue = new Queue('virusScanQueue', {
    connection: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
        username: process.env.REDIS_USERNAME,
        password: process.env.REDIS_PASSWORD
    }
})

const virusScanQueueEvent = new QueueEvents('virusScanQueue', {
    connection: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
        username: process.env.REDIS_USERNAME,
        password: process.env.REDIS_PASSWORD
    },
    autorun:true
})

virusScanQueueEvent.on('failed' , async ({jobId , failedReason})=>{
    const job = await virusScanQueue.getJob(jobId)
    console.log(`Job With ID ${jobId} is Failed To Process With Reason ${failedReason}`)
})

async function startSubsciber() {
    // let data = []   // Bulk Processing
    try {
        await subscriber.subscribe('virusScan', (msg) => {
            msg = JSON.parse(msg)
            virusScanQueue.add('scanFile', { filePath: msg.filePath , msg }, {
                attempts: 4, // 3 attempt karo,
                removeOnComplete: true,
                removeOnFail: true,
                backoff: { type: "exponential", delay: 5000 }, // phele 5 second then 10 second means (delay * 2^(attempt-1))
                timestamp: 60000, // 60 Second me hogya toh thik verna attept -- hoga agr attemp 1 h or 60 second me nhi hua toh queue se remove
                priority: 1
            })
        })
    }
    catch (error) {
        console.log(`Error in Redis Subsciber ${error.message}`)
        return { status: false, reason: error.message }
    }
}


module.exports = startSubsciber