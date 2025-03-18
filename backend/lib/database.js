'use strict';

const { Pool } = require('pg');
const pool = new Pool({
	connectionString: process.env.POSTGRESQLCONNSTR_MERKURE_DB, // Connection string variable of Azure
	ssl: {
		rejectUnauthorized: false
	}
});

/**
 * @class
 *
 */
class Database {
	constructor () { }
	
	/**
	 * Create a record in the "receiptLogs" of the database to store the transportId to check for receipt.
	 * @param  {string}   transportId Transport Id of the Neotouch document
	 * @param  {string}   recordId Id of the Salesforce record to store the receipt
	 * @param  {string}   accountId Id of the Salesforce Account record to store the receipt
	 * @param  {Function} cb Function that is called as soon as work is done or an error occurs.
	 */
	createRecommandRecord(transportId, recordId, accountId, cb) {
		// Connect to the database
		pool.connect((connectErr, client, release) => {
            if (connectErr) {
                console.error('## DATABASE - Error acquiring client', connectErr.stack);
                return cb(connectErr);
			}
			// Construct the query
			const dateToday = (new Date()).toLocaleDateString();
			const queryText = 'INSERT INTO public."merkure_receiptLogs"(transport_id, date_send, sf_record_id, sf_account_id) VALUES($1, $2, $3, $4) RETURNING id';
			// Execute the query
            client.query(queryText, [transportId, dateToday, recordId, accountId], (queryErr, result) => {
                release(); // Release the connection
                if (queryErr) {
					console.error('## DATABASE - Error executing insertion query', queryErr.stack);
					return cb(queryErr);
                }
				console.log('## DATABASE - Insertion in receiptLogs OK : ' + result.rows[0].id);
				return cb(undefined);
            })
        })
	}
	
	/**
	 * Get all records in the "receiptLogs" of the database for record with "receipt_ok" equals to false.
	 * @param  {Function} cb Function that is called as soon as work is done or an error occurs.
	 */
	getRecommandRecord(cb) {
		// Connect to the database
		pool.connect((connectErr, client, release) => {
            if (connectErr) {
                console.error('## DATABASE - Error acquiring client', connectErr.stack);
                return cb(connectErr, undefined);
			}
			// Construct the query
			const queryText = 'SELECT * FROM public."merkure_receiptLogs" WHERE receipt_ok = false';
			// Execute the query
            client.query(queryText, (queryErr, result) => {
                release(); // Release the connection
                if (queryErr) {
					console.error('## DATABASE - Error executing select query', queryErr.stack);
					return cb(queryErr, undefined);
                } 
				console.log('## DATABASE - Records in receiptLogs WHERE receipt_ok = false : ' + result.rows.length);
				return cb(undefined, result.rows);
            })
        })
	}
	
	/**
	 * Update record in the "receiptLogs" of the database for "receipt_ok" equals to true.
	 * @param  {string}   recId Id of the record in the database
	 * @param  {Function} cb Function that is called as soon as work is done or an error occurs.
	 */
	updateRecommandRecord(recId, cb) {
		// Connect to the database
		pool.connect((connectErr, client, release) => {
            if (connectErr) {
                console.error('## DATABASE - Error acquiring client', connectErr.stack);
                return cb(connectErr);
			}
			// Construct the query
			const dateToday = (new Date()).toLocaleDateString();
			const queryText = 'UPDATE public."merkure_receiptLogs" SET date_receipt = $1, receipt_ok=true WHERE id = $2';
			// Execute the query
            client.query(queryText, [dateToday, recId], (queryErr) => {
                release(); // Release the connection
                if (queryErr) {
					console.error('## DATABASE - Error executing updating query', queryErr.stack);
					return cb(queryErr);
                }
				console.log('## DATABASE - Update in receiptLogs OK : ' + recId);
				return cb(undefined);
            })
        })
	}
}

module.exports = Database;
