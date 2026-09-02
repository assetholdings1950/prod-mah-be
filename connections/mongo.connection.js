const mongoose = require("mongoose")
const dns = require("dns")
const { app_configuration } = require("../config/app.config")


const connect_mongodb = async () => {
    console.log('Connecting to database')
    if (process.env.MONGODB_DNS_SERVERS) {
        dns.setServers(process.env.MONGODB_DNS_SERVERS.split(","))
    }
    return mongoose.connect(app_configuration.MONGO_DETAILS).then((res) => {
        console.log('Database connected')
        return Promise.resolve({ status: true })
    }).catch((error) => {
        console.log('error while connecting database : ' + error)
        return Promise.reject({ status: false })
    })
}

module.exports = connect_mongodb