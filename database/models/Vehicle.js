const mongoose = require('mongoose');

const VehicleSchema = new mongoose.Schema({
    licensePlate: { type: String, required: true, unique: true },
    fleet: { type: mongoose.Schema.Types.ObjectId, ref: 'Fleet' },
    model: { type: String, required: true },
    year: { type: Number, required: true },
}, { timestamps: true });

module.exports = mongoose.model('Vehicle', VehicleSchema);