const mongoose = require('mongoose');

const FleetSchema = new mongoose.Schema({
    name: { type: String, required: true },
    vehicles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' }],
}, { timestamps: true });

module.exports = mongoose.model('Fleet', FleetSchema);