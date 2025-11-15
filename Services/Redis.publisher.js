const { createClient } = require('../Utils Service/Redi.utils')
const publisher = createClient()

publisher.on('connect' , ()=>console.log('Redis Publisher Connected To Server'))
publisher.on('reconnecting',()=>console.log('Redis Publisher is Reconnecting'))
publisher.on('close' , ()=>console.log('Redis Publisher Disconnected From Server'))

async function publishOnChannel(channelName , messageToPublish)
{
    try{
        const userReceived = await publisher.publish(channelName , messageToPublish)
        return {status:true , userReceived}
    }
    catch(error){
        console.log(`Publisher End Error ${error} Channel Name ${channelName} Message ${messageToPublish}`)
        return {status:false , reason:error.message}
    }
}

module.exports = publishOnChannel