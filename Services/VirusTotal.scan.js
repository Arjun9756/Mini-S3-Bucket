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

    let formData = new FormData()
    formData.append('file', fs.createReadStream(path.join(__dirname , '..' , filePath)))

    try {
        const res = await axios.post('https://www.virustotal.com/api/v3/files',
            formData,
            {
                headers: {
                    'x-apikey': process.env.VIRUS_TOTAL_API_KEY,
                    ...formData.getHeaders()
                }

            })

        if (res.data) {
            return res.data.data.id
        }
        throw new Error("Failed To Process The File")
    }
    catch (error) {
        console.log(`Error While Processing File With Virus Total ${error.message}`)
        throw new Error(`VirusTotal upload failed: ${error.message}`)
    }
}

async function getAnalysisReport(analysisId) {
    const url = `https://www.virustotal.com/api/v3/analyses/${analysisId}`
    try {
        let retries = 20
        while (retries-- > 0) {
            const res = await axios.get(url, {
                headers: { 'x-apikey': process.env.VIRUS_TOTAL_API_KEY }
            })

            const status = res.data.data.attributes.status
            if (status === 'completed') {
                return { date: res.data.data.attributes.date, stats: res.data.data.attributes.stats }
            }
            await new Promise((resolve, reject) => {
                setTimeout(resolve, 25000)      // Har 3 second bad resolve hoga tab tak await loop ko sleep krega agr reject krdiya hota toh await error throw krta
            })
        }
        throw new Error("Analysis Did Not Complete After 20 Retries")
    }
    catch (error) {
        throw new Error(`Not Able To Get The Analysis Report ${error.message}`)
    }
}

module.exports = { getAnalysisReport, scanFileWithVirusTotal }