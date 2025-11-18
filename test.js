const publishOnChannel = require('./Services/Redis.publisher')
const startSubsciber = require('./Services/Redis.subscriber')

async function startService()
{
    await startSubsciber()
    await publishOnChannel('virusScan' , 'hello')
}
startService()