const mongoose = require('mongoose')
const connectionString = process.env.DATABASE

mongoose.connect(connectionString,{
    useUnifiedTopology:true,
    useNewUrlParser:true
}).then(()=>{
    console.log(`MongoDB connected`);
}).catch((err)=>{
    console.log(`MongoDB connection error: ${err}`);
})