'use strict';

const WITHDRAWAL_TYPES = new Set(['fuel', 'maintenance', 'violation', 'salary', 'other', 'withdrawal']);
const FINANCIAL_TRANSACTION_TYPES = new Set([...WITHDRAWAL_TYPES, 'deposit']);

function isWithdrawalOperation(item) {
  // Priority order: explicit type → explicit direction/operation → negative amount fallback.
  if (!item || typeof item !== 'object') return false;
  const type = String(item.type || '').toLowerCase();
  if (type === 'deposit') return false;
  if (WITHDRAWAL_TYPES.has(type)) return true;
  const direction = String(item.direction || item.operation || '').toLowerCase();
  if (direction === 'withdrawal' || direction === 'debit' || direction === 'out') return true;
  const amount = Number(item.amount);
  return Number.isFinite(amount) && amount < 0;
}

module.exports = { WITHDRAWAL_TYPES, FINANCIAL_TRANSACTION_TYPES, isWithdrawalOperation };
