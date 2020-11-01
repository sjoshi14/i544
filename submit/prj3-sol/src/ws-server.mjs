import assert from 'assert';
import cors from 'cors';
import express from 'express';
import bodyParser from 'body-parser';

import {
  AppError
} from 'cs544-ss';

/** Storage web service for spreadsheets.  Will report DB errors but
 *  will not make any attempt to report spreadsheet errors like bad
 *  formula syntax or circular references (it is assumed that a higher
 *  layer takes care of checking for this and the inputs to this
 *  service have already been validated).
 */

//some common HTTP status codes; not all codes may be necessary
const OK = 200;
const CREATED = 201;
const NO_CONTENT = 204;
const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const CONFLICT = 409;
const SERVER_ERROR = 500;

export default function serve(port, ssStore) {
  const app = express();
  app.locals.port = port;
  app.locals.ssStore = ssStore;
  //const bodyParser = require('body-parser')
  setupRoutes(app);
  app.listen(port, function () {
    console.log(`listening on port ${port}`);
  });
}

const CORS_OPTIONS = {
  origin: '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  preflightContinue: false,
  optionsSuccessStatus: 204,
  exposedHeaders: 'Location',
};

const BASE = 'api';
const STORE = 'store';


function setupRoutes(app) {
  app.use(cors(CORS_OPTIONS)); //needed for future projects
  const jsonParser = bodyParser.json();  // parse application/json
  //@TODO add routes to handlers
  app.get('/' + BASE + '/' + STORE + '/:spreadsheetName', doSpreadSheetReadFormula(app));
 
  app.delete('/' + BASE + '/' + STORE + '/:spreadsheetName', doDeleteSpreadSheet(app));
  app.delete('/' + BASE + '/' + STORE + '/:spreadsheetName/:cellId', doDeleteCell(app));
   /*
    Success: working
    curl -s -D /dev/stderr  -X PATCH -d @update.json  \
        -H 'Content-Type: application/json' \
        http://localhost:2346/api/store/test-ss  | json_pp
    400: working
    curl -s -D /dev/stderr  -X PATCH -d '[ "a1", 22 ]'  \
        -H 'Content-Type: application/json' \
        http://localhost:2346/api/store/test-ss | json_pp
 */
  app.patch('/' + BASE + '/' + STORE + '/:spreadsheetName', jsonParser, checkArrTup(app), doPatchSpreadSheet(app));
  
    /*
      
  Success: working
  curl -s -D /dev/stderr  -X PATCH -d '{"formula": "f2*2 + 3"}'   \
       -H 'Content-Type: application/json' \
       http://localhost:2346/api/store/test-ss/a1 | json_pp
  
  400: working
  curl -s -D /dev/stderr  -X PATCH -d '[ "a1", 22 ]'  \
       -H 'Content-Type: application/json' \
       http://localhost:2346/api/store/test-ss/a1 | json_pp
  */ 
  app.patch('/' + BASE + '/' + STORE + '/:spreadsheetName/:cellId',jsonParser, checkObject(app), doPatchCell(app));

 /*
  Success: working
   curl -s -D /dev/stderr  -X PUT -d @update.json  \
       -H 'Content-Type: application/json' \
       http://localhost:2346/api/store/test-ss 
  400: working
   curl -s -D /dev/stderr  -X PUT -d '[ "a1", 22 ]'  \
       -H 'Content-Type: application/json' \
       http://localhost:2346/api/store/test-ss | json_pp
 */
  app.put('/' + BASE + '/' + STORE + '/:spreadsheetName', jsonParser, checkArrTup(app), doUpdateSpreadSheet(app));
 
/*
  Success: working
  curl -s -D /dev/stderr  -X PUT -d '{"formula": "f2*2 + 3"}'  \
       -H 'Content-Type: application/json' \
       http://localhost:2346/api/store/test-ss/f6 | json_pp

  400: working (Not given in testcases)
   curl -s -D /dev/stderr  -X PUT -d '[ "a1", 22 ]'  \
       -H 'Content-Type: application/json' \
       http://localhost:2346/api/store/test-ss/f6 | json_pp

 */
  app.put('/' + BASE + '/' + STORE + '/:spreadsheetName/:cellId',jsonParser, checkObject(app), doUpdateCell(app));
 
  app.use(do404(app));
  app.use(doErrors(app));

}

/****************************** Handlers *******************************/

//@TODO

//Function to retrieve all spreadsheet data with GET
function doSpreadSheetReadFormula(app) {
  return async function (req, res, next) {

    try {
      const data = req.params.spreadsheetName;
      //console.log("inside doSpreadSheetReadFormula " + data );
      const result = await app.locals.ssStore.readFormulas(data);
      //console.log("inside doSpreadSheetReadFormula " + data + "  " + result);
      res.status(200).
      json(result);
    } catch (err) {
      throw 'error within doSpreadSheetReadFormula';
      next(err);
    }

  };
}

//Function to clear spreadsheet data with DELETE
function doDeleteSpreadSheet(app) {
  return async function (req, res, next) {

    try {
      const data = req.params.spreadsheetName;
      const result = await app.locals.ssStore.clear(data);
      //console.log("inside doDeleteSpreadSheet " + data + "  " + result);
      res.status(204).
      json();
    } catch (err) {
      throw 'error within doDeleteSpreadSheet';
      next(err);
    }

  };
}

//Function to clear spreadsheet cell with DELETE
function doDeleteCell(app) {
  return async function (req, res, next) {

    try {
      const data = req.params.spreadsheetName;
      const cellId = req.params.cellId
      const result = await app.locals.ssStore.delete(data,cellId);
      //console.log("inside doDeleteCellId " + data + "  " + result);
      res.status(204).
      json();
    } catch (err) {
      throw 'error within doDeleteCellId';
      next(err);
    }

  };
}

//Function to update spreadsheet data with PATCH
function doPatchSpreadSheet(app) {
  return async function (req, res, next) {

    try {
      //console.log("inside doPatchSpreadSheet",JSON.stringify(req.body));
      const data = req.params.spreadsheetName;
      const formulas = req.body;

      formulas.forEach( async formula => {
         await app.locals.ssStore.updateCell(data, formula[0], formula[1]);
      });

      res.status(204).
      json();
    } catch (err) {
      throw 'error within doPatchSpreadSheet';
      next(err);
    }

  };
}

//Function to update spreadsheet cell with PATCH
function doPatchCell(app) {
  return async function (req, res, next) {

    try {
      const data = req.params.spreadsheetName;
      //console.log("inside doPatchCell formula",JSON.stringify(req.body));
      const formula = req.body.formula
      const cellId = req.params.cellId
      const result = await app.locals.ssStore.updateCell(data,cellId, formula);
      //console.log("inside doPatchCell " + data + "  " + result);
      res.status(204).
      json();
    } catch (err) {
      throw 'error within doPatchCell';
      next(err);
    }

  };
}

//Function to replace spreadsheet cell with PUT
function doUpdateSpreadSheet(app) {
  return async function (req, res, next) {

    try {
      //console.log("inside doPatchSpreadSheet",JSON.stringify(req.body));
      const data = req.params.spreadsheetName;
      const formulas = req.body;
      await app.locals.ssStore.clear(data);
      formulas.forEach( async formula => {
         await app.locals.ssStore.updateCell(data, formula[0], formula[1]);
      });

      res.status(201).
      json();
    } catch (err) {
      throw 'error within doPatchSpreadSheet';
      next(err);
    }

  };
}

//Function to replace spreadsheet cell with PUT
function doUpdateCell(app) {
  return async function (req, res, next) {

    try {
      //console.log("inside doUpdateSpreadSheet"+req.body.formula+" "+req.params.cellId);
      const data = req.params.spreadsheetName;
      const formula = req.body.formula
      const cellId = req.params.cellId
      const result = await app.locals.ssStore.updateCell(data, cellId, formula);
      //console.log("inside doUpdateSpreadSheet " + data + "  " + result);
      res.status(201).
      json();
    } catch (err) {
      throw 'error within doUpdateSpreadSheet';
      next(err);
    }

  };
}

//Function to check if body consists of a list of pairs
function checkTup (data) {
  let res = Array.isArray(data);
   if(res){
       for( let each of data ) {
           if( !Array.isArray(each) && each.length != 2 ) {
                 return false;
           }
       }
   }
   return res;
}

//Function to check if JSON body consists of objects and object having property "formula"
function checkObject(app) {
  return async function ( req, res, next) {
    //console.log("checkObject ");
    const isValid =  req.body != undefined && typeof req.body === 'object' && !(req.body instanceof Array) && "formula" in  req.body;
    //console.log("checkObject " + JSON.stringify(req.body) + " " + isValid);
    if( isValid ) {
      next();
    } else {
      //console.log("error in parsing")
      const message = `request body must be a list of cellId, formula pairs`;
      const result = {
        status: BAD_REQUEST,
        error: {
          code: 'BAD_REQUEST',
          message,
        },
      };
      res.status(400).
      json(result);
    }

  }
}

//Function to check if body consists of a request contains array of tuples
function checkArrTup(app) {
  return async function ( req, res, next) {
    //console.log("checkArrTup ");

    //console.log("checkArrTup " + JSON.stringify(req.body) + " " + checkTup(req.body));
    if(checkTup(req.body)) {
      next();
    } else {
      //console.log("error in parsing")
      const message = `request body must be a list of cellId, formula pairs`;
      const result = {
        status: BAD_REQUEST,
        error: {
          code: 'BAD_REQUEST',
          message,
        },
      };
      res.status(400).
      json(result);
    }

  }
}

/** Default handler for when there is no route for a particular method
 *  and path.
 */
function do404(app) {
  return async function (req, res) {
    const message = `${req.method} not supported for ${req.originalUrl}`;
    const result = {
      status: NOT_FOUND,
      error: {
        code: 'NOT_FOUND',
        message,
      },
    };
    res.status(404).
    json(result);
  };
}


/** Ensures a server error results in nice JSON sent back to client
 *  with details logged on console.
 */
function doErrors(app) {
  return async function (err, req, res, next) {
    const result = {
      status: SERVER_ERROR,
      error: {
        code: 'SERVER_ERROR',
        message: err.message
      },
    };
    res.status(SERVER_ERROR).json(result);
    console.error(err);
  };
}


/*************************** Mapping Errors ****************************/

const ERROR_MAP = {}

/** Map domain/internal errors into suitable HTTP errors.  Return'd
 *  object will have a "status" property corresponding to HTTP status
 *  code and an error property containing an object with with code and
 *  message properties.
 */
function mapError(err) {
  const isDomainError = (err instanceof AppError);
  const status =
    isDomainError ? (ERROR_MAP[err.code] || BAD_REQUEST) : SERVER_ERROR;
  const error =
    isDomainError ? {
      code: err.code,
      message: err.message
    } : {
      code: 'SERVER_ERROR',
      message: err.toString()
    };
  if (!isDomainError) console.error(err);
  return {
    status,
    error
  };
}

/****************************** Utilities ******************************/



/** Return original URL for req */
function requestUrl(req) {
  const port = req.app.locals.port;
  return `${req.protocol}://${req.hostname}:${port}${req.originalUrl}`;
}