const Valkey = require('ioredis').Redis
const path = require('path')
require('dotenv').config({
    path:path.join(__dirname , '..' , '.env')
})

// Trusting Out The Proxy Server and CDN Servers

const valkey = new Valkey({
    host:process.env.VALKEY_HOST || '127.0.0.1',
    username:process.env.VALKEY_USER || '',
    port:process.env.VALKEY_PORT || 6379,
    password:process.env.VALKEY_PASSWORD || '',
    tls:{rejectUnauthorized:false}
})


async function userRateLimit(req , res , next){
    const userIPAddress = req.headers['cf-connecting-ip'] || req.ip      // Req From Cloudflare or AWS or Google MiddleWare Services
    console.log(userIPAddress)
    if(!userIPAddress){
        return res.status(403).json({
            status:false,
            message:"Unable To Find Out User Actual IP ??"
        })
    }

    try{
        const currentCount = await valkey.incr(`rateLimit:${userIPAddress}`)
        console.log(currentCount)

        if(currentCount === 1){
            await valkey.expire(userIPAddress , 300)
        }
        
        const count = parseInt(currentCount)
        if(count > parseInt(process.env.RATE_LIMIT_THRESHOLD_VAL)){
            return res.status(429).json({
                status:false,
                message:"Max Try Reached Rate Limiter Applied"
            })
        }

        return next()
    }
    catch(error){
        console.log(`Error In Rate Limiting Service ${error.message}`)
        return res.status(500).json({
            status:false,
            message:error
        })
    }
}

module.exports = userRateLimit