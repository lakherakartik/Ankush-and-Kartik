const mongoose = require("mongoose");


const productSchema = mongoose.Schema({
    productName: {
        type: String,
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
        default: 0,
    },
    dateArrival: {
        type: Date,
        default: Date.now,
        required: true,
    },
    status: {
        type: String,
        enum: ['Pending', 'Delivered'],
        default: 'Pending',
    },
    qrCode: {
        type: String,
    }
});


module.exports = mongoose.model("Product", productSchema);