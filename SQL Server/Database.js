const mysql = require('mysql2/promise')
const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')
dotenv.config({
    path:path.join(__dirname , '..' , '.env')
})

const pool = mysql.createPool({
    host:process.env.AIVEN_SQL_HOST,
    password:process.env.AIVEN_SQL_PASSWORD,
    port:process.env.AIVEN_SQL_PORT,
    user:process.env.AIVEN_SQL_USERNAME,
    waitForConnections:true,
    connectionLimit:5,
    ssl:{
        ca:fs.readFileSync(path.join(__dirname , '..' , 'ca.pem')),
        rejectUnauthorized:true
    }
})
module.exports = pool  