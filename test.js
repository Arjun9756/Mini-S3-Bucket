const redisClient = require('./Utils Service/Redi.utils')
async function start() {
    await redisClient.publish('newsletter', "hello from news letter")
    await redisClient.subscribe('newletter', (msg) => {
        console.log(msg)
    })
}

start()