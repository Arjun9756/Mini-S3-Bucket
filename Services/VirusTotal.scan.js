const axios = require('axios')
const fs = require('fs')
const path = require('path')
const FormData = require('form-data')
require('dotenv').config({
    path: path.join(__dirname, '..', '.env')
})

async function scanFileWithVirusTotal(filePath) {
    if (!filePath) {
        return { status: false, reason: `File Path is Not Valid ${filePath}` }
    }

    const formData = new FormData()
    formData.append('file', fs.createReadStream(filePath))

    try {
        const res = await axios.post('https://www.virustotal.com/api/v3/files', {
            form,
            headers: {
                'x-apikey': process.env.VIRUS_TOTAL_API_KEY,
                ...formData.getHeaders()
            }

        })

        if (res.data) {
            return { status: true, analysisId: res.data.data.id }
        }
        throw new Error("Failed To Process The File")
    }
    catch(error){
        console.log(`Error While Processing File With Virus Total ${error.message}`)
        throw new Error(`VirusTotal upload failed: ${error.response?.data?.error || error.message}`)
    }
}

async function getAnalysisReport(analysisId)
{
    const url = `https://www/virustotal.com/api/v3/anlyses/${analysisId}`
    try
    {
        while(true){
            const res = await axios.get(url , {
                headers:{'x-apikey':process.env.VIRUS_TOTAL_API_KEY}
            })

            const status = res.data.data.attributes.status
            if(status === 'completed'){
                return {status:true , data:res.data}
            }
            await new Promise((resolve , reject)=>{
                setTimeout(resolve , 3000)      // Har 3 second bad resolve hoga tab tak await loop ko sleep krega agr reject krdiya hota toh await error throw krta
            })
        }
    }
    catch(error){
        throw new Error(`Not Able To Get The Analysis Report ${error.message}`)
    }
}

module.exports = {getAnalysisReport , scanFileWithVirusTotal}