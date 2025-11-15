const fs = require('fs')
const path = require('path')
const multer = require('multer')

const multerStorage = multer.diskStorage({
    filename:function(req , file , cb){
        const uniqueFileName = Date.now() + file.originalname
        cb(null , uniqueFileName)
    },
    destination:function(req , file , cb){
        if(!fs.existsSync(req.query.path)){
            fs.mkdirSync(req.query.path , {recursive:true})
        }
        cb(null, req.query.path)
    }
})

const memoryStorage = multer.memoryStorage()

const diskUpload = multer({storage:multerStorage})
const memoryUpload = multer({storage:memoryStorage})

module.exports = {diskUpload , memoryUpload}