import parse from './expr-parser.mjs';
import AppError from './app-error.mjs';
import { cellRefToCellId } from './util.mjs';


/**
 * User errors are reported by throwing a suitable AppError object
 * having a suitable message property and code property set as
 * follows:
 *
 *  `SYNTAX`: for a syntax error.
 *  `CIRCULAR_REF` for a circular reference.
 */

// names of private (not to be used outside this class) methods/properties 
// start with an '_'.
export default class MemSpreadsheet {

  constructor() {
    this._cells = {};  //map from cellIds to CellInfo objects
    this._undos = {};  //map from cellIds to previous this._cells[cellId]

    }
  
  /** Set cell with id baseCellId to result of evaluating string
   *  formula.  Update all cells which are directly or indirectly
   *  dependent on the base cell.  Return an object mapping the id's
   *  of all dependent cells to their updated values.  
   */
  eval(baseCellId, formula) {
    try {
      this._undos = {};

      const cellId = cellRefToCellId(baseCellId);
      const oldAst = this._cells[cellId]?.ast;
      const ast = parse(formula, cellId);
      const cell = this._updateCell(cellId, cell => cell.ast = ast);
      if (oldAst) this._removeAsDependent(cellId, oldAst);
      const updates = this._evalCell(cell, new Set());

      return updates;
    }
    catch (err) {
      console.log(err)
      this.undo();
      throw err;
    }
  }

  /** return object containing formula and value for cell cellId 
   *  return { value: 0, formula: '' } for an empty cell.
   */
  query(cellId) {
    let val = (this._cells[cellId] != undefined) ? this._cells[cellId].value : 0;
    let formula = (this._cells[cellId] != undefined) ? this._cells[cellId].formula : "";

    return { value:val , formula: formula};
  }

  /** Clear contents of this spreadsheet. No undo information recorded. */
  clear() {
    this._undos = {};
    this._cells = {};

  }

  /** Delete all info for cellId from this spreadsheet. Return an
   *  object mapping the id's of all dependent cells to their updated
   *  values.  
   */
  delete(cellId) {
    this._undos = {};

    const results = {};
    const dependents = (this._cells[cellId]) ? this._cells[cellId].dependents : [];
    
    this._updateCell(cellId, cell => {});
    delete this._cells[cellId];

    dependents.forEach( dependent => {
      let updates = this.eval( dependent,  this._cells[dependent].ast.toString(dependent) );
      Object.assign(results, updates);
    });

    
    return results;
  }

  /** copy formula from srcCellId to destCellId, adjusting any
   *  relative cell references suitably.  Return an object mapping the
   *  id's of all dependent cells to their updated values. Copying
   *  an empty cell is equivalent to deleting the destination cell.
   */
  copy(destCellId, srcCellId) {
    this._undos = {};
    let results = {};
  
    if(this._cells[srcCellId]) {
      const srcAst = this._cells[srcCellId].ast;
      const destFormula = srcAst.toString(destCellId) ;
  
      results = this.eval(destCellId, destFormula);
    } else {
      results = this.delete(destCellId);
    }

    return results;
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

  // Topological sort
  findOrder( object) {

    const keys =  Object.keys(object);
    let count = keys.length;
    const inDegrees = {};
    const queue = [];

    for ( let each of keys) {
      inDegrees[each] = object[each].length;
      if (inDegrees[each] === 0) queue.push(each);
    }

    const res = [];

    while (queue.length) {

      let size = queue.length;
      const tmpRes = [];
      for( let i = 0; i < size; i++ ) {
        const each = queue.shift();
        count--;
        tmpRes.push(each);
        
        for( const v of keys) {
          for (const u of object[v] ) {
            if (u === each) {
              inDegrees[v]--;
              if (inDegrees[v] === 0) queue.push(v);
            }
          }
        }
      }

      tmpRes.sort()
      res.push( ...tmpRes);
    }

    return count === 0 ? res : [];
  };


  dump() {
    const prereqs = this._makePrereqs();
    const topoSort = this.findOrder(prereqs);

    const result = [];
    topoSort.forEach( data => {
      result.push([
        data,
        this._cells[data].formula 
      ]);
    })

    return result;
  }

  /** undo all changes since last operation */
  undo() {
    for (const [k, v] of Object.entries(this._undos)) {
      if (v) {
	this._cells[k] = v;
      }
      else {
	delete this._cells[k];
      }
    }
  }

  /** Return object mapping cellId to list containing prerequisites
   *  for cellId for all non-empty cells.
   */
  _makePrereqs() {
    const prereqCells =
       Object.values(this._cells).filter(cell => !cell.isEmpty());
    const prereqs = Object.fromEntries(prereqCells.map(c => [c.id, []]));
    for (const cell of prereqCells) {
      for (const d of cell.dependents) {
	if (prereqs[d]) prereqs[d].push(cell.id);
      }
    }
    return prereqs;
  }

  // must update all cells using only this function to guarantee
  // recording undo information.
  _updateCell(cellId, updateFn) {
    if (!(cellId in this._undos)) {
      this._undos[cellId] = this._cells[cellId]?.copy();
    }
    const cell =
      this._cells[cellId] ?? (this._cells[cellId] = new CellInfo(cellId));
    updateFn(cell);
    return cell;
  }

  // you should not need to use these remaining methods.

  _evalCell(cell, working) {
    const value = this._evalAst(cell.id, cell.ast);
    this._updateCell(cell.id, cell => cell.value = value);
    const vals = { [cell.id]: value };
    working.add(cell.id);
    for (const dependent of cell.dependents) {
      if (working.has(dependent)) {
	const msg = `circular ref involving ${dependent}`;
	throw new AppError('CIRCULAR_REF', msg);
      }
      const depCell = this._cells[dependent];
      Object.assign(vals, this._evalCell(depCell, working));
    }
    working.delete(cell.id);
    return vals;
  }

  _evalAst(baseCellId, ast) {
    if (ast === null) {
      return 0;
    }
    else if (ast.type === 'num') {
      return ast.value;
    }
    else if (ast.type === 'ref') {
      const cellId = cellRefToCellId(ast.toString(baseCellId));
      const cell =
	this._updateCell(cellId, cell => cell.dependents.add(baseCellId));
      return cell.value;
    }
    else {
      console.assert(ast.type === 'app', `unknown ast type ${ast.type}`);
      const f = FNS[ast.fn];
      console.assert(f, `unknown ast fn ${ast.fn}`);
      return f(...ast.kids.map(k => this._evalAst(baseCellId, k)));
    }
  }

  _removeAsDependent(baseCellId, ast) {
    if (ast.type === 'app') {
      ast.kids.forEach(k => this._removeAsDependent(baseCellId, k));
    }
    else if (ast.type === 'ref') {
      const cellId = cellRefToCellId(ast.toString(baseCellId));
      this._updateCell(cellId, cell => cell.dependents.delete(baseCellId));
    }
  }

}



class CellInfo {
  constructor(id) {
    this.id = id;
    this.value = 0;    //cache of current value, not strictly necessary
    this.ast = null;
    this.dependents = new Set(); //cell-ids of cells which depend on this
    //equivalently, this cell is a prerequisite for all cells in dependents
    
  }

  //formula computed on the fly from the ast
  get formula() { return this.ast ? this.ast.toString(this.id) : ''; }

  //empty if no ast (equivalently, the formula is '').
  isEmpty() { return !this.ast; }
  
  copy() {
    const v = new CellInfo(this.id);
    Object.assign(v, this);
    v.dependents = new Set(v.dependents);
    return v;   
  }

}

const FNS = {
  '+': (a, b) => a + b,
  '-': (a, b=null) => b === null ? -a : a - b,
  '*': (a, b) => a * b,
  '/': (a, b) => a / b,
  min: (...args) => Math.min(...args),
  max: (...args) => Math.max(...args),
}
