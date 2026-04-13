const mongoose = require('mongoose');

const RouteSchema = new mongoose.Schema({
    name: { type: String, required: true },
    fleet: { type: mongoose.Schema.Types.ObjectId, ref: 'Fleet' },
    vehicles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' }],
    startLocation: { type: String, required: true },
    endLocation: { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model('Route', RouteSchema);