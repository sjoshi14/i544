import parse from './expr-parser.mjs';
import AppError from './app-error.mjs';
import { cellRefToCellId } from './util.mjs';

//use for development only
import { inspect } from 'util';
import { BADSTR } from 'dns';

export default class Spreadsheet {

  //factory method
  static async make() { return new Spreadsheet(); }
  spreadSheetObj;

  constructor() {
    //@TODO
    this.spreadSheetObj = {};
  }
  
  /** Set cell with id baseCellId to result of evaluating formula
   *  specified by the string expr.  Update all cells which are
   *  directly or indirectly dependent on the base cell.  Return an
   *  object mapping the id's of all dependent cells to their updated
   *  values.  User errors must be reported by throwing a suitable
   *  AppError object having code property set to `SYNTAX` for a
   *  syntax error and `CIRCULAR_REF` for a circular reference
   *  and message property set to a suitable error message.
   */
  async eval(baseCellId, expr) {
    const updates = {};
    //@TODO
    let ast = parse(expr);
    console.log(inspect(ast, false, Infinity));
    let oldSpreedSheet = this.deepCopyFunction(this.spreadSheetObj);

    updates[baseCellId] = this.recursiveExec(ast, baseCellId);
    

    if(this.spreadSheetObj[baseCellId] == undefined) {
      this.spreadSheetObj[baseCellId] = new CellInfo(baseCellId, expr, updates[baseCellId]);
    } else {
      this.spreadSheetObj[baseCellId].number = updates[baseCellId];
    }
    const checkSet =  new Set(); 
    if(this.checkDependency( baseCellId , checkSet)){
      const msg = `circular ref involving ${baseCellId}`;
      this.spreadSheetObj = oldSpreedSheet;
      throw new AppError('CIRCULAR_REF', msg);
    }

    // check if dependent set exist
    if(this.spreadSheetObj[baseCellId].dependent.size > 0) {
      const dependent = this.spreadSheetObj[baseCellId].dependent;

      dependent.forEach( key => {
        this.eval(key, this.spreadSheetObj[key]['expr']).then( newUpdates => {
          for(let key in newUpdates) { updates[key] = newUpdates[key] }
        })
      });
    }
    return updates;
  }

  //@TODO add methods
  recursiveExec(ast, baseCellId) {

    if(ast == undefined) return null; // handle with care
    const key = cellRefToCellId(ast.toString());

    if(ast['type'] == 'app') {
      return FNS[ast['fn']]( this.recursiveExec(ast.kids[0], baseCellId), this.recursiveExec(ast.kids[1], baseCellId));
    } else if(ast['type'] == 'num') {
      return ast['value'];
    } else if( ast['type'] == 'ref' ) {

      if( (this.spreadSheetObj[key] == null || this.spreadSheetObj[key] == undefined || !this.spreadSheetObj[key]  ) ) {
        this.spreadSheetObj[key] = new CellInfo(key, '', 0);
      }
    
      
      this.spreadSheetObj[key].dependent.add(baseCellId);
      return this.spreadSheetObj[key].number;
    }
  }

  recursiveRollback(ast, baseCellId) {

    if(ast == undefined) return null; // handle with care
    const key = cellRefToCellId(ast.toString());

    if(ast['type'] == 'app') {
      return FNS[ast['fn']]( this.recursiveExec(ast.kids[0], key), this.recursiveExec(ast.kids[1], key));
    } else if( ast['type'] == 'ref' ) {
      if( (this.spreadSheetObj[key] == null || this.spreadSheetObj[key] == undefined || !this.spreadSheetObj[key]  ) ) {
        this.spreadSheetObj[key] = new CellInfo(key, '', 0);
      }
      this.spreadSheetObj[key].dependent.delete(baseCellId);
      return this.spreadSheetObj[key].number;
    }
  }
  
  //Function for deep copying
  deepCopyFunction(inObject) {
  let outObject, value, key

  if (typeof inObject !== "object" || inObject === null) {
    return inObject // Return the value if inObject is not an object
  }

  // Create an array or object to hold the values
  outObject = Array.isArray(inObject) ? [] : {}

  for (key in inObject) {
    value = inObject[key]
    if (inObject.hasOwnProperty(key) && Set.prototype.isPrototypeOf(inObject[key])) {
      outObject[key] = new Set(inObject[key]);
    }
    else {
      // Recursively (deep) copy for nested objects, including arrays
      outObject[key] = this.deepCopyFunction(value)
    }
  }

  return outObject
}
  //Function to check if value is present in dependents set
  checkDependency ( key, setCheck ) {

    if(setCheck.has(key)) return true;
    setCheck.add(key);

    const dependent = this.spreadSheetObj[key].dependent;
    let ret = false;

    dependent.forEach( next => {
      if(this.checkDependency( next, setCheck) == true) ret = true;
    });
    setCheck.delete(key);
    return ret;
  }
}

//Map fn property of Ast type === 'app' to corresponding function.
const FNS = {
  '+': (a, b) => a + b,
  '-': (a, b=null) => b === null ? -a : a - b,
  '*': (a, b) => a * b,
  '/': (a, b) => a / b,
  min: (...args) => Math.min(...args),
  max: (...args) => Math.max(...args),
}


//@TODO add other classes, functions, constants etc as needed
class CellInfo {
  id
  expr
  number = 0
  dependent;

  constructor(id, expr, number) {
    this.id = id;
    this.expr = expr;
    this.number = number;
    this.dependent = new Set();
    // this.dependent = [];
  }

 
}

