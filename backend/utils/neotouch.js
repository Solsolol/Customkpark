'use strict';

const path = require('path');

// Librairies for Neotouch
const NeotouchSubmission = require(path.join(__dirname, '../lib', 'neotouchSubmission.js'));
const NeotouchQuery = require(path.join(__dirname, '../lib', 'neotouchQuery.js'));

/**
 * @class
 * 
 */
class Neotouch {

	/**
	* constructor for Neotouch client.
	* 
	* @access public
	*/
	constructor () {
		this.endPoint;
		this.sessionID;
	}

	/**
	 * Construct an array of Neotouch parameters with to the input values
	 * Specifies MailOnDemand variables (see documentation for their meanings)
	 * @param {Array} parameters Array of parameters
	 * @returns A array with Neotouch parameters
	 */
	static constructNeotouchParamArray(parameters) {
		let arrayResult = [];
		let customerName;
		let street;
		let streetCompl;
		let postalCode;
		let city;
		let country = "FRANCE";
		let customerAddress = "";
		
		// Get each parameters
		parameters.forEach(function(element) {	
			// Parameters are object with key:value, we get the key and value
			for (const [key, value] of Object.entries(element)) {
				if(key === "Other:CustomerName") {	
					customerName = value;	
					arrayResult.push(['Subject', 'Courrier depuis MC : '+value]);
				} else if(key === "Other:CustomerStreet") {
					street = value;
				} else if(key === "Other:CustomerStreetCompl") {
					streetCompl = value;
				} else if(key === "Other:CustomerPostalCode") {
					postalCode = value;
				} else if(key === "Other:CustomerCity") {
					city = value;
				} else if(key === "Other:CustomerCountry") {		
					country = (value === "") ? "FRANCE" : value; // FRANCE by default
				} else if(key.indexOf("Neotouch:") !== -1) {
					let keySplit = key.split("Neotouch:")[1];
					arrayResult.push([keySplit, value]);
				}	
			}
		});
		// Construct the address
		customerAddress = customerName + "\n" + street;
		if(streetCompl) {
			customerAddress += "\n" + streetCompl;
		}
		if(postalCode) {
			customerAddress += "\n" + postalCode;
		}
		if(city) {
			customerAddress += " " + city;
		}
		if(country) {
			customerAddress += "\n" + country;
		}
		// Add other parameters
		arrayResult.push(['ToBlockAddress', customerAddress]);
		arrayResult.push(['MaxRetry', '3']); 
		return arrayResult;
	}

	/**
	* Send the document with "Postal Mail" transport.
	* @param {String} endpoint Endpoint of the query service
	* @param {String} neotouchSessionID Session Id.
	* @param {String} fileName Name of the file.
	* @param {Array} paramArray Array of parameters to define message properties (message, from, to etc...).
	* @param {Function} cb Function that is called as soon as work is done or an error occurs.
	* @return string transportID ID of the transport
	* @access public
	*/
	static sendPostalDocument(endpoint, neotouchSessionID, fileName, paramArray, cb) {
		var transportID;
		// Create class for neotouch submission service
		const neotouch_submission_service = new NeotouchSubmission();
		neotouch_submission_service.setEndpoint(endpoint); // Define the good endpoint to call the submission service
		neotouch_submission_service.setSessionID(neotouchSessionID); // Define the sessionID
		
		// Now allocate a transport with transportName = 'MODEsker'
		var transport = new NeotouchSubmission.ODSubmission_Transport();
		transport.recipientType = "";
		transport.transportIndex = 0;
		transport.transportName = 'MODEsker'; // A postal mail on demand message.
		
		// Specifies MailOnDemand variables (see documentation for their meanings)
		transport.vars = new NeotouchSubmission.ODSubmission_TransportVars;
		transport.vars.Var = [];
		
		// Hopefully, we found it. Parse the returned variables
		for(let index=0; index < paramArray.length; index++) {
			console.log("## NEOTOUCH - Param : " + paramArray[index][0] +" = "+paramArray[index][1]);
			transport.vars.Var[index] = NeotouchSubmission.createValue(paramArray[index][0], paramArray[index][1]);
		}

		// Specify a text attachment to append to the MailOnDemand.
		// The attachment content is inlined in the transport description
		console.log('## NEOTOUCH - Read the file: '+fileName);
		transport.attachments = new NeotouchSubmission.ODSubmission_TransportAttachments;
		transport.attachments.Attachment = [];
		transport.attachments.Attachment[0] = new NeotouchSubmission.ODSubmission_Attachment;
		transport.attachments.Attachment[0].sourceAttachment = NeotouchSubmission.fileRead(fileName);

		console.log('## NEOTOUCH - Send the file: '+fileName);
		neotouch_submission_service.submitTransport(transport, function(result) {
			// Return transportID 	
			transportID = result.transportID;
			return cb(transportID);
		});
	}

	/**
	* Get status of a transport.
	* @param {string} endpoint Endpoint of the query service
	* @param {string} neotouchSessionID Session Id.
	* @param {string} transportID Transport Id.
	* @param {Function} cb Function that is called as soon as work is done or an error occurs.
	* @return string state State of the transport
	* @access public
	*/
	static getStatutOfTransport(endpoint, neotouchSessionID, transportID, cb) {
		var state;
		// Creating and initializing a QueryService object.
		const neotouch_query_service = new NeotouchQuery();
		neotouch_query_service.setEndpoint(endpoint); // Define the good endpoint to call the query service
		neotouch_query_service.setSessionID(neotouchSessionID); // Define the sessionID
		
		// Set the QueryRecipientTypeValue with a comma separated list of RecipientType
		// The following page lists the available recipient types and the corresponding transport names.
		// https://doc.esker.com/neotouch/cv_ly/en/webservices/index.asp?page=References/Common/RecipientTypes.html
		// Instead, the following page lists the variables common to all transports.
		// https://doc.esker.com/neotouch/cv_ly/en/webservices/index.asp?page=References/Fields/defaulttransportprintable.html
		neotouch_query_service.setRecipientType("MOD"); // Define the recipientType				

		// Build a request on the newly submitted fax transport using its unique identifier
		// We also specify the variables (attributes) we want to retrieve.
		var queryRequest = new NeotouchQuery.ODQuery_QueryRequest();
		queryRequest.nItems = 1;
		queryRequest.attributes = 'State,ShortStatus,CompletionDateTime';
		queryRequest.filter = '(ruidex=' +transportID+ ')';

		neotouch_query_service.queryFirst(queryRequest, function(result) {
			// Get result 
			if( result.nTransports === 1 ) {
				console.log('## NEOTOUCH - MailOnDemand found in database');
				// Hopefully, we found it. Parse the returned variables
				for(let iVar=0; iVar<result.transports[0].nVars; iVar++) {
					if(  result.transports[0].vars[iVar].attribute.toLowerCase()  === 'state' ) {
						state = result.transports[0].vars[iVar].simpleValue;
						console.log('state:' + state);
					}
					else if( result.transports[0].vars[iVar].attribute.toLowerCase() === 'shortstatus' ) {
						var status = result.transports[0].vars[iVar].simpleValue;
						console.log('status:' + status);
					}
					else if( result.transports[0].vars[iVar].attribute.toLowerCase() === 'completiondatetime' ) {
						var date = result.transports[0].vars[iVar].simpleValue;
						console.log('date:' + date);
					}
				}
			}
			else {
				state = "Not found";
				console.log('## NEOTOUCH - Error : MailOnDemand not found in database');
			}
			return cb(state);
		});
	}

	/**
	* Get converted attachments of a transport.
	* @param {string} endpoint Endpoint of the query service
	* @param {string} neotouchSessionID Session Id.
	* @param {string} transportID Transport Id.
	* @param {Function} cb Function that is called as soon as work is done or an error occurs.
	* @return object submissionResult ODSubmission_SubmissionResult
	* @access public
	*/
	static getConvertedAttachment(endpoint, neotouchSessionID, transportID, cb) {
		// Creating and initializing a QueryService object.
		const neotouch_query_service = new NeotouchQuery();
		neotouch_query_service.setEndpoint(endpoint); // Define the good endpoint to call the query service
		neotouch_query_service.setSessionID(neotouchSessionID); // Define the sessionID		

		//Call WS
		neotouch_query_service.queryAttachments(transportID, NeotouchQuery.ATTACHMENTS_FILTER.FILTER_CONVERTED, NeotouchQuery.WSFILE_MODE.MODE_INLINED, function(result) {
			let returnArray = [];
			// Get result 
			let found = false;
			if( result.nAttachments > 0) {
				for(const attachment of result.attachments.Attachment) {
					if(attachment.nConvertedAttachments > 0 ) {
						found = true;
						console.log('## NEOTOUCH - Valid attachment found in database');
						console.log("## NEOTOUCH - Document : " + attachment.outputName);
						const convertedAttachments = attachment.convertedAttachments;
						const convertedDoc = convertedAttachments.WSFile[0];
						if( convertedDoc.content && convertedDoc.content.length > 0 ) {
							returnArray.push(convertedDoc);
						}
					}
				}
				if(!found) {
					console.log("## NEOTOUCH - Error : no valid attachments found");
				}
			}
			else {
				console.log("## NEOTOUCH - Error : no valid attachments found");
			}
			return cb(returnArray);
		});
	}

	/**
	* Get receipt of a transport.
	* @param {string} endpoint Endpoint of the query service
	* @param {string} neotouchSessionID Session Id.
	* @param {string} transportID Transport Id.
	* @param {Function} cb Function that is called as soon as work is done or an error occurs.
	* @return object submissionResult ODSubmission_SubmissionResult
	* @access public
	*/
	static getReceipt(endpoint, neotouchSessionID, transportID, cb) {
		// Creating and initializing a QueryService object.
		const neotouch_query_service = new NeotouchQuery();
		neotouch_query_service.setEndpoint(endpoint); // Define the good endpoint to call the query service
		neotouch_query_service.setSessionID(neotouchSessionID); // Define the sessionID		

		//Call WS
		neotouch_query_service.queryAttachments(transportID, NeotouchQuery.ATTACHMENTS_FILTER.FILTER_CONVERTED, NeotouchQuery.WSFILE_MODE.MODE_INLINED, function(result) {
			let returnArray = [];
			// Get result 
			let found = false;
			if( result.nAttachments > 0) {
				for(const attachment of result.attachments.Attachment) {
					if(attachment.nConvertedAttachments > 0 ) {
						const docName = attachment.outputName;
						// Get only Attachments withe the name "Receipt.pdf" ==> Accusé de réception
						if(docName === "Receipt.pdf") {
							found = true;
							console.log('## NEOTOUCH - Valid receipt found in database');
							const convertedAttachments = attachment.convertedAttachments;
							const convertedDoc = convertedAttachments.WSFile[0];
							if( convertedDoc.content && convertedDoc.content.length > 0 ) {
								console.log("## NEOTOUCH - Document : " + convertedDoc.name);
								returnArray.push(convertedDoc);
							}
						}
					}
				}
				if(!found) {
					console.log("## NEOTOUCH - Error : no valid receipt found");
				}
			}
			else {
				console.log("## NEOTOUCH - Error : no valid receipt found");
			}
			return cb(returnArray);
		});
	}
}
	
module.exports = Neotouch;
