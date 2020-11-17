import Path from 'path';

import express from 'express';
import bodyParser from 'body-parser';

import querystring from 'querystring';

import {AppError, Spreadsheet} from 'cs544-ss';

import Mustache from './mustache.mjs';

const STATIC_DIR = 'statics';
const TEMPLATES_DIR = 'templates';

//some common HTTP status codes; not all codes may be necessary
const OK = 200;
const CREATED = 201;
const NO_CONTENT = 204;
const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const CONFLICT = 409;
const SERVER_ERROR = 500;

const __dirname = Path.dirname(new URL(import.meta.url).pathname);

export default function serve(port, store) {
  process.chdir(__dirname);
  const app = express();
  app.locals.port = port;
  app.locals.store = store;
  app.locals.mustache = new Mustache();
  app.locals.errors = new AppError();
  app.use('/', express.static(STATIC_DIR));
  setupRoutes(app);
  app.listen(port, function() {
    console.log(`listening on port ${port}`);
  });
}


/*********************** Routes and Handlers ***************************/

function setupRoutes(app) {
  app.use(bodyParser.urlencoded({extended: true}));
  
  //Routes
  app.get('/',doSpreadsheetSelection(app));
  app.post('/', redirectToSpreadSheet(app));

  app.get('/ss/:ssName',doSpreadsheetUpdate(app));
  app.post('/ss/:ssName', updateSpreadSheet(app));

  //must be last
  app.use(do404(app));
  app.use(doErrors(app));

}

/**
 * Function to perform specified operation 
 */
function updateSpreadSheet(app) {
  return async function(req, res) {
    //console.log(req.body);
    let errors = {}
    if(validateUpdate(req.body,errors)){
      let condn = req.body.ssAct;
      let ssName = req.params.ssName;
      //console.log("updateSpreadSheet"+ssName);
      try{
        if(condn == "clear" ) {
          await app.locals.Spreadsheet.clear();
        } else if( condn == "deleteCell") {
          await app.locals.Spreadsheet.delete( req.body.cellId);
        } else if( condn == "updateCell") {
          //console.log(req.body);
          await app.locals.Spreadsheet.eval( req.body.cellId, req.body.formula);
        } else if( condn == "copyCell") {
          //console.log("Inside copy"+req.body.cellId,req.body.formula);
          await app.locals.Spreadsheet.copy( req.body.cellId, req.body.formula);
        }
        res.redirect('/ss/' + ssName);
      }catch(error){
        //console.log("Error in catch"+error);
        errors.formula = error;
        await doSpreadsheetUpdate(app,errors,req.body)(req, res);
      }
    }
    else{
      //console.log("inside updateSpreadsheet error");
      await doSpreadsheetUpdate(app,errors,req.body)(req, res);
    }
  };
}

/**
 * Function to redirect to spreadsheet selection page
 */ 
function redirectToSpreadSheet(app) {
  return async function(req, res) {
    // console.log('/ss/' + req.body.ssName);
    let prevData = req.body
    let error = {};
    if(validateField('ssName',req.body, error)){
      res.redirect('/ss/' + req.body.ssName);
    }
    else{
      //console.log("Errors in redirectToSpreadsheet");
      res.status(OK).
        send(app.locals.mustache.render('SpreadsheetSelection', {prevData: prevData, errors: [{ msg: error["ssName"] }]}));
    }
  };
}

/**
 * Function to enter spreadsheet name and throw appropriate error if any
 */ 
function doSpreadsheetSelection(app,prevData) {
  return async function(req, res) {
    res.status(OK).
      send(app.locals.mustache.render('SpreadsheetSelection', {prevData: prevData, errors: [{ msg: "", }]}));
  };
}

/**
 * Function to display spreadsheet
 */ 
function doSpreadsheetUpdate(app,error,prevData) {
  return async function(req, res) {

    let message = error == undefined ? {} : error;

    //console.log("Inside doSpreadsheetUpdate"+req.params);
    let ssName = req.params.ssName;
    app.locals.Spreadsheet = await Spreadsheet.make( req.params.ssName, app.locals.store);
    //console.log("Spreadsheet instance"+app.locals.Spreadsheet);
    let dumpData = await app.locals.Spreadsheet.dump();
    for( let i = 0; i < dumpData.length; i++) {  
      let eachdata = dumpData[i];
      if(eachdata[1] == "" || isNaN(eachdata[1]) ){
        eachdata[1] = await app.locals.Spreadsheet.query(eachdata[0]).value;
        eachdata[0] = [eachdata[0].charCodeAt(0) - "a".charCodeAt(0) , Number(eachdata[0].substring(1,eachdata.length+1))-1];
        // console.log(tmp);
      }
      else {
        eachdata[0] = [eachdata[0].charCodeAt(0) - "a".charCodeAt(0) , Number(eachdata[0].substring(1,eachdata.length+1))-1];
      }
    } 
    
    let m = 10;
    let n = 10;
  
    for( let i of  dumpData) {
      n = Math.max(n,  i[0][0]+1);
      m = Math.max(m,  i[0][1]+1);
    }
    //console.log( dumpData );
    //console.log( m + " " + n);

    let resArr = []
    for( let i =0; i < m; i++){
      resArr.push([]);
        for( let j =0; j < n; j++){
          resArr[i].push("");
        }
    }

    for( let i of  dumpData) {
        resArr[i[0][1]][i[0][0]] = i[1];
    }

    let first = [];
    for( let i = 0; i < n; i++) {
      first.push({val:String.fromCharCode(i + 'A'.charCodeAt(0))});
    }
    //console.log("First data"+JSON.stringify(first));

    let matrix = []
    for(let i=1; i< resArr.length+1;i++){
      matrix.push({index:i, row: resArr[i-1].map(x => ({val:x}) )})
    }
    //console.log("Matrix data"+JSON.stringify(matrix));
    
    if(prevData == undefined){
      prevData = {}
    }
      prevData["wrapped"] = function () {
        return function (text) {
            return text.replace('value="' + prevData['ssAct']+'"', 'value="' +  prevData['ssAct']+'" checked');
        }
      }
    

    res.status(200).
    send(app.locals.mustache.render('SpreadsheetUpdate',
      { prevData: prevData, errors: message, ssName: ssName, matrix: matrix, first: first}));  
  };
}

/** Default handler for when there is no route for a particular method
 *  and path.
 */
function do404(app) {
  return async function(req, res) {
    const message = `${req.method} not supported for ${req.originalUrl}`;
    res.status(NOT_FOUND).
      send(app.locals.mustache.render('errors',
				      { errors: [{ msg: message, }] }));
  };
}

/** Ensures a server error results in an error page sent back to
 *  client with details logged on console.
 */ 
function doErrors(app) {
  return async function(err, req, res, next) {
    res.status(SERVER_ERROR);
    res.send(app.locals.mustache.render('errors',
					{ errors: [ {msg: err.message}] }));
    console.error(err);
  };
}

/************************* SS View Generation **************************/

const MIN_ROWS = 10;
const MIN_COLS = 10;

/**************************** Validation ********************************/


const ACTS = new Set(['clear', 'deleteCell', 'updateCell', 'copyCell']);
const ACTS_ERROR = `Action must be one of ${Array.from(ACTS).join(', ')}.`;

//mapping from widget names to info.
const FIELD_INFOS = {
  ssAct: {
    friendlyName: 'Action',
    err: val => !ACTS.has(val) && ACTS_ERROR,
  },
  ssName: {
    friendlyName: 'Spreadsheet Name',
    err: val => !/^[\w\- ]+$/.test(val) && `
      Bad spreadsheet name "${val}": must contain only alphanumeric
      characters, underscore, hyphen or space.
    `,
  },
  cellId: {
    friendlyName: 'Cell ID',
    err: val => !/^[a-z]\d\d?$/i.test(val) && `
      Bad cell id "${val}": must consist of a letter followed by one
      or two digits.
    `,
  },
  formula: {
    friendlyName: 'cell formula',
  },
};

/** return true iff params[name] is valid; if not, add suitable error
 *  message as errors[name].
 */
function validateField(name, params, errors) {
  const info = FIELD_INFOS[name];
  const value = params[name];
  if (isEmpty(value)) {
    errors[name] = `The ${info.friendlyName} field must be specified`;
    return false;
  }
  if (info.err) {
    const err = info.err(value);
    if (err) {
      errors[name] = err;
      return false;
    }
  }
  return true;
}

  
/** validate widgets in update object, returning true iff all valid.
 *  Add suitable error messages to errors object.
 */
function validateUpdate(update, errors) {
  const act = update.ssAct ?? '';
  switch (act) {
    case '':
      errors.ssAct = 'Action must be specified.';
      return false;
    case 'clear':
      return validateFields('Clear', [], ['cellId', 'formula'], update, errors);
    case 'deleteCell':
      return validateFields('Delete Cell', ['cellId'], ['formula'],
			    update, errors);
    case 'copyCell': {
      const isOk = validateFields('Copy Cell', ['cellId','formula'], [],
				  update, errors);
      if (!isOk) {
	return false;
      }
      else if (!FIELD_INFOS.cellId.err(update.formula)) {
	  return true;
      }
      else {
	errors.formula = `Copy requires formula to specify a cell ID`;
	return false;
      }
    }
    case 'updateCell':
      return validateFields('Update Cell', ['cellId','formula'], [],
			    update, errors);
    default:
      errors.ssAct = `Invalid action "${act}`;
      return false;
  }
}

function validateFields(act, required, forbidden, params, errors) {
  for (const name of forbidden) {
    if (params[name]) {
      errors[name] = `
	${FIELD_INFOS[name].friendlyName} must not be specified
        for ${act} action
      `;
    }
  }
  for (const name of required) validateField(name, params, errors);
  return Object.keys(errors).length === 0;
}


/************************ General Utilities ****************************/

/** return new object just like paramsObj except that all values are
 *  trim()'d.
 */
function trimValues(paramsObj) {
  const trimmedPairs = Object.entries(paramsObj).
    map(([k, v]) => [k, v.toString().trim()]);
  return Object.fromEntries(trimmedPairs);
}

function isEmpty(v) {
  return (v === undefined) || v === null ||
    (typeof v === 'string' && v.trim().length === 0);
}

/** Return original URL for req.  If index specified, then set it as
 *  _index query param 
 */
function requestUrl(req, index) {
  const port = req.app.locals.port;
  let url = `${req.protocol}://${req.hostname}:${port}${req.originalUrl}`;
  if (index !== undefined) {
    if (url.match(/_index=\d+/)) {
      url = url.replace(/_index=\d+/, `_index=${index}`);
    }
    else {
      url += url.indexOf('?') < 0 ? '?' : '&';
      url += `_index=${index}`;
    }
  }
  return url;
}

