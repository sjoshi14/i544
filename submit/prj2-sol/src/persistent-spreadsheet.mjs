import AppError from './app-error.mjs';
import MemSpreadsheet from './mem-spreadsheet.mjs';

//use for development only
import { inspect } from 'util';

import mongo from 'mongodb';

//use in mongo.connect() to avoid warning
const MONGO_CONNECT_OPTIONS = { useUnifiedTopology: true };



/**
 * User errors must be reported by throwing a suitable
 * AppError object having a suitable message property
 * and code property set as follows:
 *
 *  `SYNTAX`: for a syntax error.
 *  `CIRCULAR_REF` for a circular reference.
 *  `DB`: database error.
 */

export default class PersistentSpreadsheet {


  //factory method
  static async make(dbUrl, spreadsheetName) {

    // if(this.obj != undefined) return this.obj;
    try {
      //set up database info, including reading data
      const client = await mongo.connect(dbUrl, MONGO_CONNECT_OPTIONS);
      const db = client.db();
      const users = db.collection(spreadsheetName);
      const data = await users.find({}).project({"_id":0}).toArray();
      return new PersistentSpreadsheet(client, db, users, spreadsheetName, data);
    }
    catch (err) {
      const msg = `cannot connect to URL "${dbUrl}": ${err}`;
      throw new AppError('DB', msg);
    }
    
  }

  //constructor
  constructor(clientName, dbName, colName, spName, data) {
    this.memSpreadsheet = new MemSpreadsheet();

    for( let each of data) {

      this.memSpreadsheet.eval(each['id'], (each['formula'] != undefined)? each['formula'] : each['value'] + "" );
    }

    this.clientName = clientName;
    this.dbName = dbName;
    this.colName = colName;
    this.spName = spName;
  }

  /** Release all resources held by persistent spreadsheet.
   *  Specifically, close any database connections.
   */
  async close() {
    try{
      await this.clientName.close();
    }
    catch (err) {
      const msg = `cannot connect to URL "${dbUrl}": ${err}`;
      throw new AppError('DB', msg);
    }
  }

  /** Set cell with id baseCellId to result of evaluating string
   *  formula.  Update all cells which are directly or indirectly
   *  dependent on the base cell.  Return an object mapping the id's
   *  of all dependent cells to their updated values.
   */
  async eval(baseCellId, formula) {
    const results = this.memSpreadsheet.eval(baseCellId, formula); 
    try {
      var bulk = this.colName.initializeUnorderedBulkOp();
      for( let key in results) {
        await bulk.find( { id:  key} ).upsert()
        .updateOne({
          $set: {
            id: key,
            value :results[key]
          }}
       );
      }
      await bulk.find( { id:  baseCellId} ).update( { $set: { formula:  formula} } )
      await bulk.execute();
    }
    catch (err) {
      const msg = `cannot update "${baseCellId}: ${err}`;
      throw new AppError('DB', msg);
    }
    return results;
  }

  /** return object containing formula and value for cell cellId 
   *  return { value: 0, formula: '' } for an empty cell.
   */
  async query(cellId) {
    
    return this.memSpreadsheet.query(cellId); 
  }

  /** Clear contents of this spreadsheet */
  async clear() {
    try {
      await this.colName.remove({});
    }
    catch (err) {
      const msg = `cannot drop collection ${this.spreadsheetName}: ${err}`;
      throw new AppError('DB', msg);
    }
    /* delegate to in-memory spreadsheet */
    this.memSpreadsheet.clear();

  }

  /** Delete all info for cellId from this spreadsheet. Return an
   *  object mapping the id's of all dependent cells to their updated
   *  values.  
   */
  async delete(cellId) {
    let results = this.memSpreadsheet.delete(cellId);
    try {       
        var bulk = this.colName.initializeUnorderedBulkOp();
        await bulk.find({id: cellId}).removeOne();
        for( let key in results) {
          await bulk.find( { id:  key} ).upsert()
          .updateOne({
            $set: {
              id: key,
              value :results[key]
            }}
         );
        }
        
        await bulk.execute();
    }
    catch (err) {
      const msg = `cannot delete ${cellId}: ${err}`;
      throw new AppError('DB', msg);
    }
    return results;
  }
  
  /** copy formula from srcCellId to destCellId, adjusting any
   *  relative cell references suitably.  Return an object mapping the
   *  id's of all dependent cells to their updated values. Copying
   *  an empty cell is equivalent to deleting the destination cell.
   */
  async copy(destCellId, srcCellId) {
    const srcFormula = this.memSpreadsheet.query(srcCellId)['formula'];
    let results;

    if (!srcFormula) {
      return await this.delete(destCellId);
    }
    else {
      const results = this.memSpreadsheet.copy(destCellId, srcCellId);
      const formula =  this.memSpreadsheet.query(destCellId)['formula'] || "";

      try {
          var bulk = this.colName.initializeUnorderedBulkOp();
          for( let key in results) {
            await bulk.find( { id:  key} ).upsert()
            .updateOne({
              $set: {
                id: key,
                value :results[key]
              }}
           );
          }
          await bulk.find( { id:  destCellId} )
            .update({ 
              $set: {
                 formula:  formula
                } 
              });

          await bulk.execute();
      }
      catch (err) {
	      const msg = `cannot update "${destCellId}: ${err}`;
	      throw new AppError('DB', msg);
      }
      return results;
    }
  }

  /** Return dump of cell values as list of cellId and formula pairs.
   *  Do not include any cell's with empty formula.
   *
   *  Returned list must be sorted by cellId with primary order being
   *  topological (cell A < cell B when B depends on A) and secondary
   *  order being lexicographical (when cells have no dependency
   *  relation). 
   *
   *  Specifically, the cells must be dumped in a non-decreasing depth
   *  order:
   *     
   *    + The depth of a cell with no dependencies is 0.
   *
   *    + The depth of a cell C with direct prerequisite cells
   *      C1, ..., Cn is max(depth(C1), .... depth(Cn)) + 1.
   *
   *  Cells having the same depth must be sorted in lexicographic order
   *  by their IDs.
   *
   *  Note that empty cells must be ignored during the topological
   *  sort.
   */
  async dump() {
    return this.memSpreadsheet.dump(); 
  }

}

