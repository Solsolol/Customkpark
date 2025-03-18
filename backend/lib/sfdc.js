'use strict';

const fs   = require('fs');
const jsforce = require('jsforce');

/**
 * @class
 *
 * @example
 * const Salesforce = require('./lib/sfdc.js');
 * const sfdc = new Salesforce();
 */
class Salesforce {
	constructor () {
		this.username = process.env.SALESFORCE_LOGIN; // Env variable of Azure
		this.password = process.env.SALESFORCE_PWD; // Env variable of Azure
		this.loginUrl = process.env.SALESFORCE_URL; // Env variable of Azure
		this.clientId = process.env.SALESFORCE_CLIENTID; // Env variable of Azure
		this.clientSecret = process.env.SALESFORCE_CLIENTSECRET; // Env variable of Azure
		this.conn = {};
	}

	/**
	 * Establishes a connection to Salesforce if not already connected.
	 * @param  {Function} cb Function that is called as soon as work is done or an error occurs.
	 * @private
	 */
	_login (cb) {
		const self = this;

		if (typeof self.conn.accessToken === 'undefined') {
			self.conn = new jsforce.Connection({
				oauth2 : {
					loginUrl : self.loginUrl,
					clientId : self.clientId,
					clientSecret : self.clientSecret,
					redirectUri : self.loginUrl
				}
				//loginUrl: self.loginUrl
			});
			self.conn.login(self.username, self.password, (e, userInfo) => {
				if (e)	return cb(e);

				self.conn = new jsforce.Connection({
					instanceUrl: self.conn.instanceUrl,
					accessToken: self.conn.accessToken
				});
				self.conn.bulk.pollTimeout = 60000;
				return cb(undefined);
			});
		} else	return cb(undefined);
	}

	/**
	 * Deactive a connection to Salesforce.
	 * @private
	 */
	_logout () {
		const self = this;

		if (typeof self.conn.accessToken !== 'undefined') {
			self.conn.logout(function(err) {
				if (err) { 
					throw err
				}
				console.log('## SALESFORCE - Successfully disconnect');
			});
		} 
	}

	/**
	 * Checks if the session is expired and resets the connection if necessary
	 * @param  {object} e Error object returned by jsforce
	 * @return {boolean}  True if there was a connection error, otherwise false.
	 * @private
	 */
	_checkIfSessionIsExpired (e) {
		const self = this;

		if (e && e.errorCode.indexOf('INVALID_SESSION_ID') >= 0) {
			self.conn = {};
			return true;
		}
		return false;
	}

	/**
	 * Get the ContentDocument thanks to the ContentVersion
	 * @param  {string}   contVersionId Id of the ContentVersion
	 * @param  {Function} cb Function that is called as soon as work is done or an error occurs.
	 * @private
	 */
	_getContentDocumentId (contVersionId, cb) {
		const self = this;

		// Try the query
		const query = 'SELECT ContentDocumentId FROM ContentVersion WHERE Id = \'' + contVersionId + '\'';
		self.conn.query(query, (e, r) => {
			// If there was an error, check if only the session expired
			if (e && self._checkIfSessionIsExpired(e)) {
				// If the session has expired, call this function again, as the connection
				// object has now been reset and another login will be performed next time
				return self._getContentDocumentId(contVersionId, cb);
			} else if (e) {
				return cb(e);
			}

			if (r.records.length === 1) {
				return cb(undefined, r.records[0].ContentDocumentId);
			} else {
				return cb(new Error('### SALESFORCE - Error : No ContentVersion returned.'));
			}
		});
	}

	/**
	 * Create the ContentDocumentLink between the record and the ContentDocument
	 * @param  {string}   contentDocId Id of the ContentDocument
	 * @param  {string}   recordId Id of the record
	 * @param  {Function} cb Function that is called as soon as work is done or an error occurs.
	 * @private
	 */
	_createContentDocumentLink (contentDocId, recordId, cb) {
		const self = this;

		// Create the parameters
		const contentDocumentLinkDatas = {
			ContentDocumentId: contentDocId,
			LinkedEntityId: recordId,
			ShareType: "V"
		};

		// Call WS
		self.conn.sobject("ContentDocumentLink").create(contentDocumentLinkDatas, function(err, ret) {
			// If there was an error, check if only the session expired
			if (err && self._checkIfSessionIsExpired(err)) {
				// If the session has expired, call this function again, as the connection
				// object has now been reset and another login will be performed next time
				return self._createContentDocumentLink(contentDocId, recordId, cb);
			} else if (err) {
				return cb(err);
			}

			if (err || !ret.success) { 
				return cb(new Error('### SALESFORCE - Error : ' + err)); 
			} else {
				console.log('## SALESFORCE - ContentDocumentLink : '+ret.id);
				return cb(undefined, ret);
			}
		});
	}
	
	/**
	 * Send and link a file to a record in Salesforce.
	 * @param  {string}   filename Name of the document to save in Salesforce
	 * @param  {string}   filePath Path of the temp file to send
	 * @param  {string}   recordId Id of the record
	 * @param  {Function} cb Function that is called as soon as work is done or an error occurs.
	 */
	linkAttachmentToRecord (filename, filePath, recordId, cb) {
		// Check if valid 15 or 18 digit Salesforce-Id is given.
		if (!/^([a-zA-Z0-9]{15}|[a-zA-Z0-9]{18})$/g.test(recordId)) return cb(new Error('### SALESFORCE - Error : Invalid Salesforce-Id given.'));

		const self = this;

		// Login if necessary
		self._login((e) => {
			if (e)	return cb(e);

			// Read File
			fs.readFile(filePath, function (err, filedata) {
				if (err){
					return cb(new Error('### SALESFORCE - Error : ' + err));
				} else {
					var base64data = Buffer.from(filedata, "utf-8").toString('base64'); 
					const contentVersionData = {
						Title: filename,
						PathOnClient: filePath,
						VersionData: base64data
					};

					// Create the ContentVersion
					console.log('## SALESFORCE - Create the ContentVersion');
					self.conn.sobject("ContentVersion").create(contentVersionData, function(err, ret) {
						// If there was an error, check if only the session expired
						if (e && self._checkIfSessionIsExpired(e)) {
							// If the session has expired, call this function again, as the connection
							// object has now been reset and another login will be performed next time
							return self.linkAttachmentToRecord(filename, filePath, recordId, cb);
						} else if (e) {
							return cb(e);
						}

						if (err || !ret.success) { 
							return cb(new Error('### SALESFORCE - Error : ' + err)); 
						} else {
							console.log('## SALESFORCE - ContentVersion : '+ret.id);
							console.log('## SALESFORCE - Get ContentDocument Id');
							self._getContentDocumentId(ret.id, function(getErr, contentDocumentId) {
								if (getErr) { 
									return cb(new Error('### SALESFORCE - Error : ' + getErr)); 
								} else {
									console.log('## SALESFORCE - ContentDocument : '+contentDocumentId);
									console.log('## SALESFORCE - Create the ContentDocumentLink');
									self._createContentDocumentLink(contentDocumentId, recordId, function(createErr, result) {
										if (createErr) {
											return cb(new Error('### SALESFORCE - Error : ' + createErr));
										} else {											
											// Return the result
											return cb(undefined, result);
										}
									});
								}
							});
						}
					});
				}
			});
		});
	}
}

module.exports = Salesforce;
