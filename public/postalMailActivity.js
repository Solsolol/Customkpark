'use strict';

define(function (require) {
	var Postmonger = require('postmonger');
	var connection = new Postmonger.Session();
	var payload = {};
	var steps = [
		{"key": "techSelection", "label": "Carbone & Salesforce"},
		{"key": "postageSelection", "label": "Affranchissement"},
		{"key": "printSelection", "label": "Impression & autre"}
	];
	var currentStep = steps[0].key;
	var eventDefinitionKey = '';
	var deFields = [];
	var schema;

	$(window).ready(function () {
		connection.trigger('ready');
		connection.trigger('requestInteraction');	
	});

	function initialize (data) {
		if (data) {
			payload = data;
		}
	}

	function onClickedNext () {
		switch (currentStep.key) {
			case 'techSelection':				
				if(reportFieldValidity('other-input-docid')) {
					connection.trigger('nextStep');
				} else {					
					connection.trigger('ready');
				}
				break;
			case 'printSelection':
				if(reportFieldValidity('postalmail-input-fromCompany')) {
					save();
				} else {					
					connection.trigger('ready');
				}
				break;
			default:				
				connection.trigger('nextStep');
				break;
		}

		/*if (currentStep.key === 'printSelection') {
			save();
		} else {
			connection.trigger('nextStep');
		}*/
	}

	function onClickedBack () {
		connection.trigger('prevStep');
	}

	function onGotoStep (step) {
		showStep(step);
		connection.trigger('ready');
	}

	function showStep (step, stepIndex) {
		if (stepIndex && !step) {
			step = steps[stepIndex - 1];
		}

		$('.step').hide();
		currentStep = step;
		switch (currentStep.key) {
			case 'techSelection':
				$('#step1').show();
				$('#step1 input').focus();
				break;
			case 'postageSelection':
				$('#step2').show();
				$('#step2 select').focus();
				break;
			case 'printSelection':
				$('#step3').show();
				$('#step3 select').focus();
				break;
		}
	}

	function requestedSchemaHandler (data) {
		schema = data['schema'];
		// Get the Data Extension event schema and parse it to get only fields (Triggered by the requestedInteractionHandler function)
		if(deFields.length === 0) {
			// Get the fields
			for(let index=0; index<schema.length; index++) {
				let field = schema[index].key.split('Event.' + eventDefinitionKey + '.')[1];
				deFields.push(field);
			}
				
			// Construct selected fields 
			constructSelectField();

			console.log('*** deFields ***', deFields);	
		}
	}

	function requestedInteractionHandler (settings) {
		try {
			eventDefinitionKey = settings.triggers[0].metaData.eventDefinitionKey;

			console.log('*** type ***', settings.triggers[0].type);	
			// Get the Salesforce event schema and parse it to get only fields
			if (settings.triggers[0].type === 'SalesforceObjectTriggerV2' &&
					settings.triggers[0].configurationArguments &&
					settings.triggers[0].configurationArguments.eventDataConfig) {

				// This workaround is necessary as Salesforce occasionally returns the eventDataConfig-object as string
				if (typeof settings.triggers[0].configurationArguments.eventDataConfig === 'stirng' ||
							!settings.triggers[0].configurationArguments.eventDataConfig.objects) {
						settings.triggers[0].configurationArguments.eventDataConfig = JSON.parse(settings.triggers[0].configurationArguments.eventDataConfig);
				}

				// Get the fields
				settings.triggers[0].configurationArguments.eventDataConfig.objects.forEach((obj) => {
					deFields = deFields.concat(obj.fields.map((fieldName) => {
						return obj.dePrefix + fieldName;
					}));
				});
				
				// Construct selected fields 
				constructSelectField();

			// Get the Data Extension event schema and parse it to get only fields
			} else if(settings.triggers[0].type === 'EmailAudience') {
				connection.trigger('requestSchema'); // Request the schema of the Entry Event (Data Extension)	
			}
			console.log('*** deFields ***', deFields);	
		} catch (e) {
			console.error(e);
		}
	}

	/**
	 * Function executed when the last step is done
	 */
	function save () {
		payload['arguments'] = payload['arguments'] || {};
		payload['arguments'].execute = payload['arguments'].execute || {};
		let payloadInArgument = [];

		// Construct the payload
		// Get values selected by the user
		payloadInArgument.push({ 'Other:DocumentId': $('#other-input-docid').val() });
		payloadInArgument.push({ 'Neotouch:FromCompany': $('#postalmail-input-fromCompany').val() });
		payloadInArgument.push({ 'Neotouch:FromName': $('#postalmail-input-fromName').val() });
		payloadInArgument.push({ 'Neotouch:StampType': $('#postalmail-select-stampType').val() });
		payloadInArgument.push({ 'Neotouch:Color': $('#postalmail-select-color').val() });
		payloadInArgument.push({ 'Neotouch:BothSided': $('#postalmail-select-bothSided').val() });
		payloadInArgument.push({ 'Neotouch:Cover': $('#postalmail-select-cover').val() });
		payloadInArgument.push({ 'Neotouch:NeedValidation': $('#postalmail-select-needValidation').val() });
		
		// Get values from Salesforce
		for(let index=0; index < deFields.length; index++) {
			let value = '{{Event.' + eventDefinitionKey + '.\"' + deFields[index] + '\"}}';
			if (deFields[index] == $('#other-select-recordSaveId').val()) {
				payloadInArgument.push( { 'Other:RecordSaveId': value });				
			} if (deFields[index] == $('#other-select-customerName').val()) {
				payloadInArgument.push( { 'Other:CustomerName': value });				
			} if (deFields[index] == $('#other-select-customerStreet').val()) {
				payloadInArgument.push( { 'Other:CustomerStreet': value });				
			} if (deFields[index] == $('#other-select-customerStreetCompl').val()) {
				payloadInArgument.push( { 'Other:CustomerStreetCompl': value });				
			} if (deFields[index] == $('#other-select-customerPostalCode').val()) {
				payloadInArgument.push( { 'Other:CustomerPostalCode': value });				
			} if (deFields[index] == $('#other-select-customerCity').val()) {
				payloadInArgument.push( { 'Other:CustomerCity': value });				
			} if (deFields[index] == $('#other-select-customerCountry').val()) {
				payloadInArgument.push( { 'Other:CustomerCountry': value });				
			} 
			let argument = { [deFields[index]]: value };
			payloadInArgument.push(argument);
		}
		console.log(payloadInArgument);

		payload['arguments'].execute.inArguments = payloadInArgument;
		payload['metaData'] = payload['metaData'] || {};
		payload['metaData'].isConfigured = true;

		console.log(JSON.stringify(payload));

		connection.trigger('updateActivity', payload);
	}

	function constructSelectField() {
		deFields.forEach((option) => {
			$('#other-select-recordSaveId').append($('<option>', {
				value: option,
				text: option
			}));
			$('#other-select-customerName').append($('<option>', {
				value: option,
				text: option
			}));
			$('#other-select-customerStreet').append($('<option>', {
				value: option,
				text: option
			}));
			$('#other-select-customerStreetCompl').append($('<option>', {
				value: option,
				text: option
			}));
			$('#other-select-customerPostalCode').append($('<option>', {
				value: option,
				text: option
			}));
			$('#other-select-customerCity').append($('<option>', {
				value: option,
				text: option
			}));
			$('#other-select-customerCountry').append($('<option>', {
				value: option,
				text: option
			}));
		});
	}
	
	function reportFieldValidity(fieldId) {
		if ($('#'+fieldId)[0].validity.valueMissing) {
			$('#'+fieldId)[0].setCustomValidity('Ce champ est obligatoire.');
		} else {
			$('#'+fieldId)[0].setCustomValidity('');
		}
		return $('#'+fieldId)[0].reportValidity();
	}

	document.getElementById('other-input-docid').addEventListener('change', function(event) {
		reportFieldValidity('other-input-docid');
	}, false);

	document.getElementById('postalmail-input-fromCompany').addEventListener('change', function(event) {
		reportFieldValidity('postalmail-input-fromCompany');
	}, false);

	connection.on('initActivity', initialize);
	connection.on('clickedNext', onClickedNext);
	connection.on('clickedBack', onClickedBack);
	connection.on('gotoStep', onGotoStep);
	connection.on('requestedInteraction', requestedInteractionHandler);
	connection.on('requestedSchema', requestedSchemaHandler);
});