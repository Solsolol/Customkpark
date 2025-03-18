'use strict';

const path = require('path');
const SOAP = require('strong-soap').soap;
var options = {};

/**
 * @class
 * 
 */
class NeotouchQuery {

	/**
	* constructor for ODQuery_QueryService client.
	* 
	* @access public
	*/
	constructor () {
		this.endPoint;
		this.sessionID;
		this.recipientType;
		this.queryID;
		this.SessionHeaderValue;
		this.QueryHeaderValue;
	}

	/**
	* Query First.
	* @param {Object} request QueryRequest 
	* @param {Function} cb Function that is called as soon as work is done or an error occurs.
	* @return object queryResult ODQuery_QueryResult
	* @access public
	*/
	queryFirst(request, cb) {
		const self = this;
		var queryResult;
		const param = { 
			request: request 
		};  

		// Create the SOAP client
		SOAP.createClient(path.join(__dirname, '../wsdls', 'QueryService2.wsdl'), options, function(soapErr, client) {
			// Define endpoint and header 
			client = self.setQueryHeader(client);			
			// Call Submit function to send the document to neotouch
			client.QueryFirst(param, function(err, response, envelope) {
				if (err) {
					throw err
				}
				
				// Get the response
				//console.log('Response Envelope: \n' + envelope);
				//console.log('Response: \n' + JSON.stringify(response));
				const result = JSON.parse(JSON.stringify(response.return));		
				// Define the result of the call				
				queryResult = self.getQueryResult(result);

				// Save queryID & recipientType for subsequent calls (QueryNext/QueryPrevious) 
				//queryID from response
				let lastResponse = client.lastResponse;
				let pos1 = lastResponse.indexOf('<queryID>');
				let pos2 = lastResponse.indexOf('</queryID>');
				if(pos1 >= 0 && pos2 > (pos1+9)) {
					self.queryID = lastResponse.substr(pos1+9, pos2-(pos1+9));	
				} else {
					self.queryID = "";
				}

				//recipientType from last request
				let lastRequest = client.lastRequest;
				let pos3 = lastRequest.indexOf('<recipientType>');
				let pos4 = lastRequest.indexOf('</recipientType>');
				if(pos3 >= 0 && pos4 > (pos1+15)) {
					self.recipientType = lastRequest.substr(pos3+15, pos4-(pos3+15));	
				} else {
					self.recipientType = "";
				}

				return cb(queryResult);
			});
		});
		
		return queryResult;
	}

	/**
	* Query Attachments.
	* @param {string} transportID transport ID 
	* @param {string} eFilter ATTACHMENTS_FILTER
	* @param {string} eMode WSFILE_MODE
	* @param {Function} cb Function that is called as soon as work is done or an error occurs.
	* @return object statisticsResult ODQuery_StatisticsResult
	* @access public
	*/
	queryAttachments(transportID, eFilter, eMode, cb) {
		const self = this;
		const param = { 
			transportID: transportID, 
			eFilter: eFilter, 
			eMode: eMode, 
		};  

		// Create the SOAP client
		SOAP.createClient(path.join(__dirname, '../wsdls', 'QueryService2.wsdl'), options, function(soapErr, client) {
			// Define endpoint and header 
			client = self.setQueryHeader(client);			
			// Call Submit function to send the document to neotouch
			client.QueryAttachments(param, function(err, response, envelope) {
				if (err) {
					throw err
				}
				
				// Get the response
				//console.log('Response Envelope: \n' + envelope);
				//console.log('Response: \n' + JSON.stringify(response));
				const result = JSON.parse(JSON.stringify(response.return));		
				
				return cb(result);
			});
		});
	}

	setEndpoint(endPoint) {
		this.endPoint = endPoint
	}

	setSessionID(sessionID) {
		this.sessionID = sessionID
	}

	setRecipientType(recipientType) {
		this.recipientType = recipientType
	}
	
	/**
	* Get Results from Query calls.
	* 
	* @param {string} wrapped string returned by the call
	* @retunr object queryResult ODQUery_QueryResult
	* @access public
	*/
	getQueryResult(wrapper) {
		var queryResult = new NeotouchQuery.ODQuery_QueryRequest();
           
		queryResult.noMoreItems = wrapper.noMoreItems;
		queryResult.nTransports = wrapper.nTransports;
			
        for(let i=0; i < queryResult.nTransports; i++) { 	
			if (queryResult.nTransports > 1) {	
				queryResult.transports[i] = wrapper.transports.Transport[i];
			}
			else {
				queryResult.transports = [wrapper.transports.Transport[i]];
			}

			if (queryResult.transports[i].nVars > 1) {
				let vars = queryResult.transports[i].vars;
                let my_vars = [];
				// loop through vars                
                for(let j=0; j<queryResult.transports[i].nVars; j++) {
                    my_vars.push(vars.Var[j]);
				}
                queryResult.transports[i].vars = my_vars;
			}
			else {
				let vars = queryResult.transports[i].vars;
				queryResult.transports[i].vars = [vars.Var[0]];
			}	
		}

        return queryResult;
	}

    setQueryHeader(client){
		client.setEndpoint(this.endPoint);

		client.clearSoapHeaders(); //reinitializing headers
		client.addSoapHeader({ SessionHeaderValue: { sessionID: this.sessionID } },"","tns");
		client.addSoapHeader({ QueryRecipientTypeValue: { recipientType: this.recipientType } },"","tns");
		if(this.queryID) {
			client.addSoapHeader({ QueryHeaderValue: { queryID: this.queryID } },"","tns");
		}
		return client;	
	}
	
	/******************
	 *  Sub Classes 
	*******************/

	/**
	 * Esker ODQuery_SessionHeader Object.
	 * 
	 * @access public
	 */  
	static get ODQuery_SessionHeader() {
		return class ODQuery_SessionHeader {
			constructor () {
				this.sessionID;
			}
		}
	}

	/**
	 * Esker ODQuery_QueryHeader Object.
	 * 
	 * @access public
	 */  
	static get ODQuery_QueryHeader() {
		return class ODQuery_QueryHeader {
			constructor () {
				this.queryID;
				this.recipientType;
			}
		}
	}

	/**
	 * Esker ODQuery_QueryRequest Object.
	 * 
	 * @access public
	 */  
	static get ODQuery_QueryRequest() {
		return class ODQuery_QueryRequest {
			constructor () {
				this.filter;
				this.sortOrder;
				this.attributes;
				this.nItems;
				this.includeSubNodes = 'false';
				this.searchInArchive = 'false';
				this.fileRefMode = 'MODE_INLINED';
			}
		}
	}

	/**
	 * Esker ODQuery_QueryResult Object.
	 * 
	 * @access public
	 */  
	static get ODQuery_QueryResult() {
		return class ODQuery_QueryResult {
			constructor () {
				this.noMoreItems;
				this.nTransports;
				this.transports;
			}
		}
	}
	
	/**
	 * Esker ODQuery_QueryResult Object.
	 * 
	 * @access public
	 */  
	static get QueryResult_WSFile() {
		return class QueryResult_WSFile {
			constructor () {
				this.name;
				this.mode;
				this.content;
				this.url;
				this.storageID;
			}
		}
	}

	/**
	 * Enumeration WSFILE_MODE.
	 * 
	 * @access public
	 */  
	static get WSFILE_MODE() {
		return {
			MODE_UNDEFINED: 'MODE_UNDEFINED',
			MODE_ON_SERVER: 'MODE_ON_SERVER',
			MODE_INLINED: 'MODE_INLINED'
		};
	}

	/**
	 * Enumeration ATTACHMENTS_FILTER.
	 * 
	 * @access public
	 */  
	static get ATTACHMENTS_FILTER() {
		return {
			FILTER_NONE: 'FILTER_NONE', 
			FILTER_ALL: 'FILTER_ALL', 
			FILTER_CONVERTED: 'FILTER_CONVERTED',
			FILTER_SOURCE: 'FILTER_SOURCE'
		};
	}
}

module.exports = NeotouchQuery;
