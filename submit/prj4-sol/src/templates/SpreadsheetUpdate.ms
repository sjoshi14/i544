<!DOCTYPE html>
<head>
  <title>CS 444/544 Spreadsheet Update</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <h1>CS 444/544 Spreadsheet Update for {{ssName}}</h1>
  <p><a id="ss-act" href="/">Open other spreadsheet</a></p>
  <table class="ss">
    <tbody>
    <tr>

        <th>{{ssName}}</th>
        {{#first}}
            <th>{{val}}</th>
        {{/first}}

    </tr>
    
    {{#matrix}} 
        <tr>
        <th>{{index}}</th>       
        {{#row}}
            <td>{{val}}</td>
        {{/row}}
        </tr>
    {{/matrix}}



  </tbody></table>
  <p class="error"></p>
  <form action="/ss/{{ssName}}" method="POST">
      <label for="ssAct">Action</label>
      <span>
	      <fieldset>
        {{#prevData.wrapped}}
          <div>
	          <input name="ssAct" type="radio" id="actClear" value="clear">
	          <label for="actClear">Clear Spreadsheet</label>
          </div>
          <div>
            <input name="ssAct" type="radio" id="actDelete" value="deleteCell">
	          <label for="act">Delete Cell</label>
          </div>
          <div>
	          <input name="ssAct" type="radio" id="actUpdate" value="updateCell">
	          <label for="actUpdate">Update Cell</label>
          </div>
          <div>
	          <input name="ssAct" type="radio" id="actCopy" value="copyCell">
	          <label for="actCopy">Copy Cell</label>
          </div>
        {{/prevData.wrapped}}
	      </fieldset>
	      <br>
	      <span class="error" id="ssActError">{{errors.ssAct}}</span>
      </span>
      <label for="cellId">Destination Cell ID</label>
      <span>
	      <input name="cellId" value="{{prevData.cellId}}" id="cellId">
	      <br>
	      <span class="error" id="cellIdError">{{errors.cellId}}</span>
      </span>
      <label for="formula">Formula</label>
      <span>
	      <input name="formula" value="{{prevData.formula}}" id="formula">
	      <br>
	      <span class="error" id="formulaError">{{errors.formula}}</span>
      </span>
      <label>&nbsp;</label>
      <input type="submit" value="Update">
  </form>
</body>
</html>
