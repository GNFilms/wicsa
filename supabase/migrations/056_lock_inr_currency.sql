-- Migration 056: Lock default currency strictly to INR across accounts and deals
UPDATE deals SET currency = 'INR' WHERE currency IS NULL OR currency != 'INR';
UPDATE accounts SET default_currency = 'INR' WHERE default_currency IS NULL OR default_currency != 'INR';
ALTER TABLE accounts ALTER COLUMN default_currency SET DEFAULT 'INR';
ALTER TABLE deals ALTER COLUMN currency SET DEFAULT 'INR';
