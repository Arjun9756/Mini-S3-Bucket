const nodemailer = require('nodemailer')
const path = require('path')
const dotenv = require('dotenv')

dotenv.config({
    path:path.join(__dirname , '..' , '.env')
})

const transporter = nodemailer.createTransport({
    host:process.env.NODEMAILER_HOST_NAME,
    port:process.env.NODEMAILER_PORT,
    secure:process.env.NODEMAILER_SECURE,
    auth:{
        user:process.env.NODEMAILER_USER,
        pass:process.env.NODEMAILER_PASS
    }
})

module.exports = transporter