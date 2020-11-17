<!DOCTYPE html>
<head>
  <title>CS 444/544 Spreadsheet Selection</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <h1>CS 444/544 Spreadsheet Selection</h1>
  <p class="error"></p>
  <form action="/" method="POST">
      <label for="ssName">Open Spreadsheet Name</label>
      <span>
        <input name="ssName" value="{{prevData.ssName}}" id="ssName">
        <br>
        {{#errors}}
          <span class="error" id="ssNameError">{{msg}}</span>
        {{/errors}}

      </span>
      <input type="submit" value="Open">
  </form>
</body>
</html>
