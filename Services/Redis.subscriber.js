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
    }
})

const virusScanQueueEvent = new QueueEvents('virusScanQueue', {
    connection: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
        username: process.env.REDIS_USERNAME,
        password: process.env.REDIS_PASSWORD
    },
    autorun: true
})

const mailQueue = new Queue('mailQueue' , {
    connection: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
        username: process.env.REDIS_USERNAME,
        password: process.env.REDIS_PASSWORD
    },
})

virusScanQueueEvent.on('failed', async ({ jobId, failedReason }) => {
    const job = await virusScanQueue.getJob(jobId)
    if (job || jobId)
        console.log(`Job With ID ${jobId} is Failed With Reason ${failedReason}`)
    else
        console.log(`Not Able To Fetch The Job From Queue Reason Backend Not Able to Find`)
})

async function startSubscriber() {
    try {
        await subscriber.subscribe('virusAndMailService')
        subscriber.on('message', async (channel, msg) => {

            let data;
            try {
                data = JSON.parse(msg)
                console.log(`JSON Conversion`, data)

                if (data.name == 'virusScan') {
                    const job = await virusScanQueue.add('virusScan', data, {
                        attempts: 4,
                        removeOnComplete: true,
                        backoff: { type: 'exponential', delay: 500 }, // next attempt to be made after fail with delayed queue delay * 2 ^ (attempt - 1),
                        removeOnFail: true,
                        priority: 1
                    })
                }
                else if(data.name == 'mailSend'){
                    const job = await mailQueue.add('mailSend' , data , {
                        attempts:4,
                        backoff:{type:"exponential" , delay:500},
                        removeOnComplete:true,
                        removeOnFail:true,
                        priority:1
                    })
                }
            }
            catch (error) {
                console.log(`Error in Redis Subscriber For Queue Logic${error.message}`)
            }
        })
    }
    catch (error) {
        console.log(error.message)
        // Monitor Out The Services
    }
}
startSubscriber()