'use strict';

const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');
const pckg = require(path.join(__dirname, '..', 'package.json'));
const express = require('express');
const PDFDocument = require('pdf-lib').PDFDocument;

// Helper utility for verifying and decoding the jwt sent from Salesforce Marketing Cloud
const verifyJwt = require(path.join(__dirname, 'lib', 'jwt.js'));
// Librairies for Neotouch API
const Neotouch = require(path.join(__dirname, 'utils', 'neotouch.js'));
const NeotouchSession = require(path.join(__dirname, 'lib', 'neotouchSession.js'));
// Librairies for Carbone.io API
const Carbone = require(path.join(__dirname, 'lib', 'carbone.js'));
// Librairies for Salesforce API
const Salesforce = require(path.join(__dirname, 'lib', 'sfdc.js'));
// Librairies for Database
const Database = require(path.join(__dirname, 'lib', 'database.js'));

// Utility classes for errors
const handleErrors = require(path.join(__dirname, 'middleware', 'handleErrors.js'));
const { GeneralError, Unauthorized, BadRequest } = require(path.join(__dirname, 'utils', 'errors.js')); 

// Create the web server
const app = express();

// Register middleware that parses the request payload.
app.use(express.raw({ type: 'application/jwt' }));
app.use(express.json({ limit: '50mb' })); // Adjust the limit of the content
app.use(express.urlencoded({extended: true}));

// Serve the custom activity's interface, config, etc.
app.use('/slds', express.static(path.join(__dirname, '..', '/node_modules/@salesforce-ux/design-system/assets')));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Property multer ti upload PDF in memory
const uploadFiles = require(path.join(__dirname, 'middleware', 'upload.js'));

/**
 * Construct an object of Carbone.io parameters for data with to the input values
 * @param {*} parameters Parameters (array or JSON)
 * @param {Boolean} isJsonObject Is a JSON object
 * @returns A object with Carbone.io parameters
 */
function constructCarboneDatas(parameters, isJsonObject) {
	let result = {};
	let parametersArray = [];
	const keyRegex = /\.|:/g; // Detect . or : character

	// Convert JSON in Array
	if(isJsonObject) {
		parametersArray.push(parameters);
	} else {
		parametersArray = parameters;
	}

	// Get each parameters
	parametersArray.forEach(function(element) {	
		// Parameters are object with key:value, we get the key and value
		for (const [key, value] of Object.entries(element)) {
			// Don't get parameter if Key start with Other or Neotouch
			if((key.indexOf("Other:") !== -1 || key.indexOf("Neotouch:") !== -1) === false) {
				const keyValue = key.replace(keyRegex, '-'); // Replace . and : by -
				result[keyValue] = value;
			}	
		}
	});
	return result;
}

/**
 * Execute API of Neotouch to send the document to the customer by Postal Mail
 * @param {string} fileName Path and name of the document to send
 * @param {Array} paramArray Array of the Neotouch parameters
 * @param {Function} cb Function that is called as soon as work is done or an error occurs.
 */
function sendDocumentToNeotouch(fileName, paramArray, cb) {	
	// Variables for Neotouch
	let neotouchBindings;
	let neotouchSessionID;

	// Call "getBindings" of Neotouch for get URL
	console.log('### NEOTOUCH : Retrieving bindings');
	const neotouch_session_service = new NeotouchSession();
	neotouch_session_service.getBindings(function(bindingsResult) {
		// Get all endpoints returns
		neotouchBindings = bindingsResult;

		// Call login function
		console.log('### NEOTOUCH : Authenticating session');
		neotouch_session_service.setEndpoint(neotouchBindings.sessionServiceLocation); // Define the good endpoint to call the login
		neotouch_session_service.login(function(loginResult) {
			// Get sessionID 
			neotouchSessionID = loginResult.sessionID;
			neotouch_session_service.setSessionID(neotouchSessionID); // Define the sessionID
			
			// Call WS
			console.log('### NEOTOUCH : Sending Mail On Demand Request');
			Neotouch.sendPostalDocument(neotouchBindings.submissionServiceLocation, neotouchSessionID, fileName, paramArray, function(result) {
				console.log("### NEOTOUCH : Transport ID : "+result);
				neotouch_session_service.logout();
				return cb(undefined, result);
			});
				
		});
	});
}

/**
 * Execute API of Carbone.io to send templateId and datas for document rendering
 * @param {string} templateId Id of the template in Carbone.io
 * @param {object} data Object with data (values) used to generate the document
 * @param {string} convertFormat Format of the document to generate (pdf or excel or another)
 * @param {object} convertOptions Object with data (values) used for the PDF conversion
 * @returns object Return a object wither renderId, fileNamePath and content.
 */
async function renderCarboneDocument(templateId, data, convertFormat, convertOptions) {
	try {
		const carbone_service = new Carbone();
		// Call "Render" API of Carbone
		console.log('## CARBONE : Render the document');
		const renderId = await carbone_service.executeRenderDocument(templateId, data, convertFormat, convertOptions);
		console.log('## CARBONE : renderId: '+renderId);
		// Get the BLOB object 
		console.log('## CARBONE : Download the document');
		const blob = await carbone_service.downloadRenderDocument(renderId);
		// Write the temp file
		const fileNamePath = path.join(__dirname, 'data', renderId);
		console.log('## CARBONE : File Path: '+fileNamePath);
		await fs.writeFile(fileNamePath, blob, 'utf8');
		console.log('## CARBONE : File written on storage');
		return { renderId: renderId, fileNamePath: fileNamePath, content: blob };
	} catch (err) {
		throw new Error(err);
	}
}

/**
 * Execute API of Salesforce to create a ContentVersion/ContentDocument (Salesforce Files) and linked to the recordId
 * @param {string} recordId Id of the Salesforce record to link the document
 * @param {string} fileName Name of the document in Salesforce
 * @param {string} filePath Path of the temp file 
 * @param {Function} cb Function that is called as soon as work is done or an error occurs.
 */
function sendDocumentToSalesforce(recordId, fileName, filePath, cb) {	

	console.log('## SALESFORCE : Send the document to : '+recordId);
	const sfdc = new Salesforce();
	// Call the function that retrieves desired data from Service Cloud
	sfdc.linkAttachmentToRecord(fileName, filePath, recordId, (err, result) => {
		if (err) {
			return cb(err);
		} else {			
			console.log('## SALESFORCE : Document created - '+ JSON.stringify(result));
			return cb(undefined);
		}
	});
}

/**
 * Function to create a record in the "receiptLogs" of the database to follow the receipt document
 * @param {string} transportId Transport Id of the Neotouch document
 * @param {string} recordId Id of the Salesforce record to store the receipt
 * @param {string} accountId Id of the Salesforce Account record to store the receipt
 * @param {Function} cb Function that is called as soon as work is done or an error occurs.
 */
function initReceiptLogs(transportId, recordId, accountId, cb) {	

	console.log('## DATABASE : Create a record in "receiptLogs');
	const database = new Database();
	database.createRecommandRecord(transportId, recordId, accountId, function(err) {	
		if (err) {
			return cb(err);
		} else {			
			console.log('## DATABASE : Record created');
			return cb(undefined);
		}
	});
}

/**
 * Function to get a receipt in Neotouch for the transportId
 * @param {string} transportId Transport Id of the Neotouch document
 * @param {Function} cb Function that is called as soon as work is done or an error occurs.
 */
function getNeotouchReceipt(transportId, cb) {	
	// Variables for Neotouch
	let neotouchBindings;
	let neotouchSessionID;

	// Call "getBindings" of Neotouch for get URL
	console.log('### NEOTOUCH : Retrieving bindings');
	const neotouch_session_service = new NeotouchSession();
	neotouch_session_service.getBindings(function(bindingResult) {
		// Get all endpoints returns
		neotouchBindings = bindingResult;
		// Call login function
		console.log('### NEOTOUCH : Authenticating session');
		neotouch_session_service.setEndpoint(neotouchBindings.sessionServiceLocation); // Define the good endpoint to call the login
		neotouch_session_service.login(function(loginResult) {
			// Get sessionID 
			neotouchSessionID = loginResult.sessionID;
			neotouch_session_service.setSessionID(neotouchSessionID); // Define the sessionID

			Neotouch.getReceipt(neotouchBindings.queryServiceLocation, neotouchSessionID, transportId, function(result) {				
				neotouch_session_service.logout();
				if(result.length === 0) {
					console.log('### NEOTOUCH : No receipt for : '+transportId);
					return cb(undefined, null);
				} else {
					console.log('### NEOTOUCH : Receipt found for : '+transportId);
					return cb(undefined, result);					
				}
			});
		});
	});
}

/**
* MARKETING CLOUD - NEOTOUCH TASKS
*/

// Route that is called for every contact who reaches the custom split activity
app.post('/neotouch/execute', (req, res, next) => {

	try {
		verifyJwt(req.body, pckg.options.marketingCloud.jwtSecret, (err, decoded) => {
			console.log('### JB ACTIVITY - Start Execute');

			try {
				// Verification error -> unauthorized request
				if (err) {
					console.error('### JB ACTIVITY - Error : '+err);
					throw new Unauthorized(err);
				}

				if (decoded && decoded.inArguments && decoded.inArguments.length > 0) {
					let carboneDocumentId = "";
					let recordIdSaved = "";
					let accountId = "";
					let documentName = "";
					let neotouchparamArray = [];
					let salesforceparamArray = [];
					let fileNamePath;
					let isRecommandMessage = false; // Define if it's a "Courrier recommandé"

					console.log("## In Arguments : "+JSON.stringify(decoded.inArguments));

					// Get Neotouch parameters
					neotouchparamArray = Neotouch.constructNeotouchParamArray(decoded.inArguments);
					// Get Salesforce parameters for Carbone.Io
					salesforceparamArray = constructCarboneDatas(decoded.inArguments, false);

					// Get Other parameters
					decoded.inArguments.forEach(function(element) {				
						// Parameters are object with key:value, we get the key and value
						for (const [key, value] of Object.entries(element)) {
							if(key === "Other:DocumentId") {
								carboneDocumentId = value;
							} else if(key === "Other:RecordSaveId") {
								recordIdSaved = value;
							} else if(key === "Other:CustomerName") {		
								documentName = 'Courrier postal à '+value;
							} else if(key === "Neotouch:StampType" && value === "R1") {		
								isRecommandMessage = true;
							} else if(key.indexOf("Account.Id") !== -1) {
								accountId = value;
							}
						}
					});

					// Check Carbone DocumentId
					console.log("## Document Id : "+carboneDocumentId);
					if(carboneDocumentId === "") {
						console.error('### JB ACTIVITY - carboneDocumentId invalid.');
						throw new BadRequest('carboneDocumentId invalid');
					}

					// Check Salesforce RecordSaveId
					console.log("## Salesforce Record Id : "+recordIdSaved);
					if(recordIdSaved === "") {
						console.error('### JB ACTIVITY - recordIdSaved invalid.');
						throw new BadRequest('recordIdSaved invalid');
					}
					console.log("## Neotouch parameters : "+JSON.stringify(neotouchparamArray));
					console.log("## Salesforce parameters : "+JSON.stringify(salesforceparamArray));

					// Render Document with Carbone.io			
					console.log('### JB ACTIVITY - Start renderCarboneDocument');
					renderCarboneDocument(carboneDocumentId, salesforceparamArray, "pdf", null)
					.then(result => {
						fileNamePath = result.fileNamePath;
						// Send Document to Neotouch					
						console.log('### JB ACTIVITY - Start sendDocumentToNeotouch');
						sendDocumentToNeotouch(fileNamePath, neotouchparamArray, function (neotouchError, transportId) {
							try {
								if (neotouchError) {
									// Delete the temp file
									fs.unlink(fileNamePath);
									console.error('### JB ACTIVITY - Error : '+neotouchError);
									throw new GeneralError(neotouchError);
								} else {
									// Create a log record in the database to follow the receipt if the message is "Recommandé"
									if(isRecommandMessage) {
										console.log('### JB ACTIVITY - Start initReceiptLogs');
										initReceiptLogs(transportId, recordIdSaved, accountId, function (dbError) {											
											if (dbError) {
												console.error('### JB ACTIVITY - Error : '+dbError);
											}
										});
									}

									// Send to Salesforce
									console.log('### JB ACTIVITY - Start sendDocumentToSalesforce');
									sendDocumentToSalesforce(recordIdSaved, documentName, fileNamePath, function (sfError) {
										try {
											// Delete the temp file
											console.log('### JB ACTIVITY - Delete the temp file');
											fs.unlink(fileNamePath);

											if (sfError) {
												console.error('### JB ACTIVITY - Error : '+sfError);
												throw new GeneralError(sfError);
											} else {
												console.log('### JB ACTIVITY - End Execute');
												return res.status(200).json({success: true});
											}																			
										} catch (sfErr) { next(sfErr); }
									});
								} 
							} catch (neoErr) { next(neoErr); }
						});
					})	
					.catch (carboneErr => { next(carboneErr) });
				} else {
					console.error('### JB ACTIVITY - inArguments invalid.');
					throw new BadRequest('inArguments invalid');
				}
			} catch (genErr) { next(genErr); }
		});
	} catch (jwtErr) { next(jwtErr); }
});

// Routes for saving, publishing and validating the custom activity. In this case
// nothing is done except decoding the jwt and replying with a success message.
app.post(/\/neotouch\/(save|publish|validate)/, (req, res, next) => {
	verifyJwt(req.body, pckg.options.marketingCloud.jwtSecret, (errJwt, decoded) => {
		try {
			// verification error -> unauthorized request
			if (errJwt) {
				throw new Unauthorized(errJwt);
			}

			return res.status(200).json({success: true});
		} catch (err) {
			next(err);
		}
	});
});

/**
* DEBUG FUNCTIONS
*/
/*
app.get('/queryNeotouchStatus', function (req, res, next) {	
	var transportId = req.query.transportId;
	console.log('### QueryStatus for '+transportId);

	try {
		// Variables for Neotouch
		var neotouchBindings;
		var neotouchSessionID;

		// Call "getBindings" of Neotouch for get URL
		console.log('## Retrieving bindings');
		const neotouch_session_service = new NeotouchSession();
		neotouch_session_service.getBindings(function(bindingsResult) {
			// Get all endpoints returns
			neotouchBindings = bindingsResult;

			// Call login function
			console.log('## Authenticating session');
			neotouch_session_service.setEndpoint(neotouchBindings.sessionServiceLocation); // Define the good endpoint to call the login
			neotouch_session_service.login(function(loginResult) {
				// Get sessionID 
				neotouchSessionID = loginResult.sessionID;
				neotouch_session_service.setSessionID(neotouchSessionID); // Define the sessionID

				Neotouch.getStatutOfTransport(neotouchBindings.queryServiceLocation, neotouchSessionID, transportId, function(result) {
					res.send("State of the transport with ID '"+transportId+"' : "+result);
					neotouch_session_service.logout();
				});
			});
		});
	} catch (err) {
		next(err)
	}
})

app.get('/receipt', function(req, res){
	//const file = `${__dirname}/upload-folder/dramaticpenguin.MOV`;
	//res.download(file); // Set disposition and send it.
	var transportId = req.query.transportId;
	console.log('### Download for '+transportId);

	// Variables for Neotouch
	var neotouchBindings;
	var neotouchSessionID;

	// Call "getBindings" of Neotouch for get URL
	console.log('### Retrieving bindings');
	const neotouch_session_service = new NeotouchSession();
	neotouch_session_service.getBindings(function(bindingsResult) {
		// Get all endpoints returns
		neotouchBindings = bindingsResult;

		// Call login function
		console.log('### Authenticating session');
		neotouch_session_service.setEndpoint(neotouchBindings.sessionServiceLocation); // Define the good endpoint to call the login
		neotouch_session_service.login(function(loginResult) {
			// Get sessionID 
			neotouchSessionID = loginResult.sessionID;
			neotouch_session_service.setSessionID(neotouchSessionID); // Define the sessionID

			Neotouch.getReceipt(neotouchBindings.queryServiceLocation, neotouchSessionID, transportId, function(result) {				
				neotouch_session_service.logout();
				if(result.length > 0) {
					let fileNamePath = path.join(__dirname, result[0].name);
					// Write the temp file
					fs.writeFile(fileNamePath, result[0].content, 'base64', function (err) {
						if (err) {
							console.log('## err: '+err);
						} else {
							// Donwload the file then delete it from the temp dir
							res.download(fileNamePath, result[0].name, function (err) {
								if (err) {
									console.log('## err: '+err);
								} else {
									// Delete the temp file
									fs.unlink(fileNamePath);
								}
							})
						}
					})
				} else {					
					res.send("No receipt for the transport with ID '"+transportId+"'");
				}
			});
		});
	});
});

app.get('/carbone', async (req, res, next) => {
	console.log('### Carbone ');

	try {
		let templateId = 'e5cb6feb6b25b2bf4ecaf6c2db6db27ecbb76f581f5216d496c8db9b59b7f33a'; // special template id for demo purpose
		let data = {          
			id       : 42,
			date     : 1492012745,
			company  : { name: 'myCompany' , address: 'here' , city: 'Notfar' , postalCode: 123456 },
			customer : { name: 'myCustomer', address: 'there', city: 'Faraway', postalCode: 654321 },
			products : [ {name: 'product 1' , priceUnit: 0.1, quantity: 10, priceTotal: 1 } ],
			total    : 140
		}

		const result = await renderCarboneDocument(templateId, data);
		// Donwload the file then delete it from the temp dir
		res.download(result.fileNamePath, result.renderId, function (dlErr) {
			try {
				if (dlErr) {
					throw new GeneralError(dlErr);
				} else {
					// Delete the temp file
					fs.unlink(result.fileNamePath);
				}
			} catch (err) {
				next(err)
			}
		})
	} catch (err) {
		next(err)
	}
});

app.get('/salesforce', function(req, res){
	console.log('### salesforce ');

	var fileName = path.join(__dirname, 'data', "invoice.pdf");	// Document sent - Change it by a path to a local document
	var recordId = '0016E00000sgX1l';

	const sfdc = new Salesforce();
	// Call the function that retrieves desired data from Service Cloud
	sfdc.linkAttachmentToRecord("invoice.pdf", fileName, recordId, (err, result) => {
		if (err) {
			console.error(err);
			return res.status(500).end();
		} else {			
			console.log('## document created - '+ JSON.stringify(result));
			return res.status(200).end();
		}
	});
});

app.get('/db', function(req, res){
	console.log('### db ');
	const transportId = req.query.transportId;
	console.log('### db for '+transportId);
	
	initReceiptLogs(transportId, 'test', 'test', function (dbError) { 
		if (dbError) {
			console.error(dbError);
			return res.status(500).end();
		} else {
			return res.status(200).end();
		}
	});
});

app.get('/cron', function(req, res){
	console.log("---------------------");
	console.log("### CRON - Running Cron Job to check receipts");

	// Get records in the database
	console.log('### CRON - Check records in "receiptLogs"');
	const database = new Database();
	database.getRecommandRecord(function(err, results) {		
		if (err) {
			console.error(err);
		} else {
			// Loop on each record of the database
			for (let index = 0; index < results.length; index++) {
				let record = results[index];
				console.log('### CRON - Check receipt for : '+record.transport_id);
				getNeotouchReceipt(record.transport_id, function(err, result) {		
					if (err) {
						console.error(err);
					} else {
						// Receipt found
						let fileNamePath = path.join(__dirname, result[0].name);
						// Write the temp file
						fs.writeFile(fileNamePath, result[0].content, 'base64', function (err) {
							if (err) {
								console.error('### CRON - Error : '+err);
							} else {
								// Send to Salesforce
								console.log('### CRON - Start sendDocumentToSalesforce for : '+record.transport_id);
								sendDocumentToSalesforce(record.sf_record_id, "Accusé de réception", fileNamePath, function (err) {
									// Delete the temp file
									console.log('### CRON - Delete the temp file');
									fs.unlink(fileNamePath);

									if (err) {
										console.error(err);
									} else {
										// Update the database record
										console.log('### CRON - Update database record : '+record.transport_id);
										database.updateRecommandRecord(record.id, function(err) {
											if (err) {
												console.error(err);
											} else {
												// Update the database record
												console.log('### CRON - Record updated in the database for : '+record.id);
											}
										});
									}
								});
							}
						})
					}
				});
			}
		}
	});
});
*/

/**
* SALESFORCE FUNCTIONS
*/

app.post('/salesforce/v1/renderDocument', async (req, res, next) => {
	console.log('### SALESFORCE - Start renderDocument V1');
	const { templateId, data, convertFormat, convertOptions } = req.body;
	let salesforceparamArray = [];

	try {
		console.debug('## templateId : '+templateId);
		console.debug('## convertFormat : '+convertFormat);
		console.debug('## convertOptions : '+JSON.stringify(convertOptions));
		//console.debug('## data : '+JSON.stringify(data));

		// Check entry arguments
		if (!templateId || !data) {
			throw new BadRequest('Missing required fields: templateId or data');
		}

		// Construct parameters for Carbone.Io
		console.log('### SALESFORCE - Start constructCarboneDatas');
		salesforceparamArray = constructCarboneDatas(data, true);
		//console.debug('## salesforceparamArray : '+JSON.stringify(salesforceparamArray));
		
		console.log('### SALESFORCE - Start renderCarboneDocument');
		renderCarboneDocument(templateId, salesforceparamArray, convertFormat, convertOptions)
		.then(result => {
			console.log('### SALESFORCE - Download file');
			// Donwload the file then delete it from the temp dir
			res.download(result.fileNamePath, result.renderId, function (dlErr) {
				try {
					// Delete the temp file
					fs.unlink(result.fileNamePath);
					if (dlErr) {
						console.error('## SALESFORCE - Error : '+dlErr);
						throw new GeneralError(dlErr);
					} 
				} catch (err) {
					next(err)
				}
			})
		})
		.catch(err => {
			next(err)	
		})
	} catch (err) {
		next(err)
	}
});

app.post("/salesforce/v1/mergePDF", async (req, res, next) => {
	console.log('### SALESFORCE - Start mergePDF V1');

	try {
		// Init multer to get files
		await uploadFiles(req, res).catch (upErr => { next(upErr) });	
		const pdfFileName = req.files[0].originalname;
		console.log('## SALESFORCE - Number of files: '+req.files.length);
		console.log('## SALESFORCE - Original Name: '+pdfFileName);

		// Check errors
		if (req.files === undefined) {
			throw new BadRequest("The service only supports PDF files");
		}
		if (req.files.length < 2) {
			throw new BadRequest("To merge the files, you need at least 2 PDF files. Actualy "+req.files.length+" file(s)");
		}

		// Initialize variables		
		let pdfsToMerge = [];
		for(const pdfObject of req.files) {
			const pdfBuffer = pdfObject.buffer;
			pdfsToMerge.push(pdfBuffer);
			console.log('## SALESFORCE - Merge file '+pdfFileName+' with '+pdfObject.originalname);
		}
		
		// Merge PDF files
		const mergedPdf = await PDFDocument.create(); 
		for (const pdfBytes of pdfsToMerge) { 
			const pdf = await PDFDocument.load(pdfBytes); 
			const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
			copiedPages.forEach((page) => {
				mergedPdf.addPage(page); 
			}); 
		} 

		// Create PDF merged
		const buf = await mergedPdf.save();        // Uint8Array
		console.log('## SALESFORCE - PDF created');

		// Write the temp file
		const fileNamePath = path.join(__dirname, 'data', pdfFileName);
		console.log('## SALESFORCE - File name: '+fileNamePath);
		await fs.writeFile(fileNamePath, buf, 'utf8');
		// Donwload the file then delete it from the temp dir
		res.download(fileNamePath, pdfFileName, function (dlErr) {
			try {
				// Delete the temp file
				fs.unlink(fileNamePath);
				if (dlErr) {
					console.error('## SALESFORCE - Error : '+dlErr);
					throw new GeneralError(dlErr);
				} 
			} catch (err) {
				next(err)
			}
		})
	} catch (err) {
		next(err)
	}
});

/**
* SCHEDULED TASKS
*/

// Schedule tasks to be run on the server
cron.schedule("0 22 * * *", function() {
	console.log("---------------------");
	console.log("### CRON - Running Cron Job to check receipts");

	// Get records in the database
	console.log('### CRON - Check records in "receiptLogs"');
	const database = new Database();
	database.getRecommandRecord(function(err, results) {		
		if (err) {
			console.error(err);
		} else {
			// Loop on each record of the database
			for (const record of results) {
				console.log('### CRON - Check receipt for : '+record.transport_id);
				getNeotouchReceipt(record.transport_id, function(neoErr, result) {		
					if (neoErr) {
						console.error(neoErr);
					} else {
						// Receipt found
						const fileNamePath = path.join(__dirname, result[0].name);
						// Write the temp file
						fs.writeFile(fileNamePath, result[0].content, 'base64', function (filErr) {
							if (filErr) {
								console.error('### CRON - Error : '+filErr);
							} else {
								// Send to Salesforce
								console.log('### CRON - Start sendDocumentToSalesforce for : '+record.transport_id);
								sendDocumentToSalesforce(record.sf_record_id, "Accusé de réception", fileNamePath, function (sfErr) {
									// Delete the temp file
									console.log('### CRON - Delete the temp file');
									fs.unlink(fileNamePath);

									if (sfErr) {
										console.error(sfErr);
									} else {
										// Update the database record
										console.log('### CRON - Update database record : '+record.transport_id);
										database.updateRecommandRecord(record.id, function(dbErr) {
											if (dbErr) {
												console.error(dbErr);
											} else {
												// Update the database record
												console.log('### CRON - Record updated in the database for : '+record.id);
											}
										});
									}
								});
							}
						})
					}
				});
			}
		}
	});
});

/**
* OTHER FUNCTIONS
*/

// Use the error handling middleware
// The error handling middleware should be placed last among other middleware and routes in order for it to function properly
app.use(handleErrors);

// Start the server and listen on the port specified by Heroku/Azure or defaulting to 12345
const server = app.listen(process.env.PORT || 12345, () => {
	console.log('Merkure application is now running!');
});
server.setTimeout(500000);