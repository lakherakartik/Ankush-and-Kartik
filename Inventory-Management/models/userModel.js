require('dotenv').config();  
const mongoose = require("mongoose");
const plm = require("passport-local-mongoose");

mongoose.connect("mongodb+srv://ankushjaiswal:pqMIEN0hkr58qvLe@cluster0.c1mma.mongodb.net/")
.then(() => console.log("Connected to MongoDB"))
.catch((error) => console.log("Error connecting to MongoDB:", error));

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true 
    },
    email: { 
        type: String, 
        required: true, 
        unique: true 
    },
    name: { 
        type: String,
        required: true 
    }
});

userSchema.plugin(plm);
module.exports = mongoose.model("user", userSchema);
