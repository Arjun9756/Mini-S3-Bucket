const { createClient } = require('../Utils Service/Redis.utils')
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
    },
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
    return new Promise(async (resolve , reject)=>{
        try{
            await subscriber.subscribe('virusScan')
            subscriber.on('message' , (channel , msg)=>{
                console.log(channel , msg)
            })

            resolve()
        }
        catch(error){
            console.log(error.message)
            reject()
        }
    })
}

module.exports = startSubsciber