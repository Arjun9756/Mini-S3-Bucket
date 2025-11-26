const jwt = require('jsonwebtoken')
const pool = require('../SQL Server/Database')

async function verifyToken(req, res, next) {
    const token = req.headers['authorization'].split(' ')[1]
    console.log(token)

    if (!token) {
        return res.status(401).json({
            status: false,
            messagee: "Your Token is Expired or Missing Please Relogin"
        })
    }

    let connection;
    try {
        connection = await pool.getConnection()
        connection.query('USE MINI_S3_BUCKET')

        const decode = jwt.verify(token, process.env.JWT_SECRET_KEY, { algorithms: ['HS256'] })
        const [rows , fields] = await connections.quer('SELECT id FROM users WHERE id = ?' , [decode._id])

        if(!rows[0].id){
            return res.status(401).json({
                status:false,
                message:"User is Not Login or Registered or Token Expire"
            })
        }

        req.user = {
            _id: decode._id,
            name: decode.name,
            email: decode.email
        }
        console.log(decode)
        next()
    }
    catch (error) {
        console.log(`Error While Decoding The Token ${error.message}`)
        return res.status(501).json({
            status: false,
            message: "Token Decoding Failed"
        })
    }
}

module.exports = verifyToken