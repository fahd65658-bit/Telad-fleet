import React from 'react';

const STATUS_MAP = {
  active:      { label: 'نشط',    color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  maintenance: { label: 'صيانة',  color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' },
  inactive:    { label: 'متوقف', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
};

export default function VehicleCard({ vehicle, onDelete, canDelete }) {
  const status = STATUS_MAP[vehicle.status] || STATUS_MAP.inactive;

  return (
    <div className="card hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center text-xl">
          🚗
        </div>
        <span className={`badge ${status.color}`}>{status.label}</span>
      </div>

      <h3 className="font-semibold text-slate-800 dark:text-white text-sm mb-1">
        {vehicle.plate || vehicle.plateNumber}
      </h3>
      <p className="text-slate-500 dark:text-slate-400 text-xs mb-1">
        {vehicle.model || vehicle.type || '—'}
      </p>
      {vehicle.driver && (
        <p className="text-slate-500 dark:text-slate-400 text-xs">
          👤 {vehicle.driver}
        </p>
      )}
      {vehicle.location && (
        <p className="text-slate-500 dark:text-slate-400 text-xs mt-1 truncate">
          📍 {vehicle.location}
        </p>
      )}

      {canDelete && (
        <button
          onClick={() => onDelete?.(vehicle._id || vehicle.id)}
          className="mt-3 w-full btn-danger text-xs py-1.5"
        >
          حذف المركبة
        </button>
      )}
    </div>
  );
}
