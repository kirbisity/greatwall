/** Cloud saver is a helper class that has all the built in functions to
save projects to the api. Use like cloud = new CloudSaver();
You can optionally specify the URLs to use.
@param {String} optionalProjAPIURL - URL of project api
@param {String} optionalFileAPIURL - URL of project api
@param {String} optionalLoginUrl - URL of project api
@param {String} optionalLoadProjURL - URL of project api
@param {String} optionalUserAPIURL - URL of project api
 */
function CloudSaver(optionalProjAPIURL,
                     optionalFileAPIURL,
                     optionalLoginUrl,
                     optionalLoadProjURL,
                     optionalUserAPIURL
                   ) {
  if (optionalProjAPIURL) this.ProjAPIURL = optionalProjAPIURL;
  else this.projAPIURL = '/api/projects/';
  if (optionalFileAPIURL) this.fileAPIURL = optionalFileAPIURL;
  else this.fileAPIURL = '/api/files/';
  if (optionalLoginUrl) this.loginUrl = optionalLoginUrl;
  else this.loginUrl = '/accounts/login/';
  if (optionalLoadProjURL) this.loadProjURL = optionalLoginUrl;
  else this.loadProjURL = '/projects/';
  if (optionalUserAPIURL) this.userAPIURL = optionalUserAPIURL;
  else this.userAPIURL = '/api/user';
};

/** Log in does what it sounds like, makes a post to the API to log you in,
follow up with get CSRF or Get user data.
@param {String} username - Username to log in with
@param {String} password - Password to log in with
@param {function} callBack - The returned function
@param {function} errorCallBack - If there is an error
 */
CloudSaver.prototype.login = function(username,
                                      password,
                                      callBack,
                                      errorCallBack) {
   $.post(this.loginUrl, {'login': username, 'password': password},
   callBack).fail(errorCallBack);
};


/** Use this to allow other API calls besides login */
CloudSaver.prototype.getCSRFToken = function() {
    /** gets a cookie of a specific type from the page
    @param {String} name - should pretty much always be csrftoken
    @return {String} - returns the cookie
     */
    function getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie != '') {
            let cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                let cookie = jQuery.trim(cookies[i]);
                // Does this cookie string begin with the name we want?
                if (cookie.substring(0, name.length + 1) == (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(
                                                          name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }
    let csrftoken = getCookie('csrftoken');

    /** tests if this is csrf safe
    @param {String} method - stests the given method
    @return {Boolean} - is safe
     */
    function csrfSafeMethod(method) {
        return (/^(GET|HEAD|OPTIONS|TRACE)$/.test(method));
    }

    /** test that a given url is a same-origin URL
    @param {String} url - the URL to test
    @return {Boolean} - is same origin
     */
    function sameOrigin(url) {
        let host = document.location.host; // host + port
        let protocol = document.location.protocol;
        let srOrigin = '//' + host;
        let origin = protocol + srOrigin;
        return (url == origin ||
            url.slice(0, origin.length + 1) == origin + '/') ||
            (url == srOrigin ||
             url.slice(0, srOrigin.length + 1) == srOrigin + '/') ||
            !(/^(\/\/|http:|https:).*/.test(url));
    }

    $.ajaxSetup({
        beforeSend: function(xhr, settings) {
            if (!csrfSafeMethod(settings.type) && sameOrigin(settings.url)) {
                xhr.setRequestHeader('X-CSRFToken', csrftoken);
            }
        },
    });
};

/** Saves a file to the server, save the ID for use with create / update project
@param {String} file - The data to be uploaded
@param {function} callBack - The returned function
@param {function} errorCallBack - If there is an error
 */
CloudSaver.prototype.saveFile = function(file, callBack, errorCallBack) {
  $.ajax({
    type: 'PUT',
    url: this.fileAPIURL,
    data: file,
    processData: false,
    contentType: false,
    success: callBack,
  }).fail(errorCallBack);
};

/** Make a project to be able to find your saved file again, returns the details
of the project created, including ID for updating
@param {String} projectName - Name of your project
@param {int} applicationID - The number of the application you're using
@param {String} dataID - The file location from save file call back
@param {String} imgID - The image file location important for viewing projects
@param {function} callBack - The return function
@param {function} errorCallBack - If there is an error
 */
CloudSaver.prototype.createProject = function(projectName,
                                              applicationID,
                                              dataID,
                                              imgID,
                                              callBack,
                                              errorCallBack) {
    $.post(this.projAPIURL, {
        name: projectName,
        description: '',
        classroom: '',
        application: applicationID,
        project: dataID,
        screenshot: imgID,
    }, callBack, 'json').fail(errorCallBack);
};

/** Update a project instead of making a new one
@param {int} projectID - ID of the number to be updated
@param {String} projectName - Name of your project
@param {int} applicationID - The number of the application you're using
@param {String} dataID - The file location from save file call back
@param {String} imgID - The image file location important for viewing projects
@param {function} callBack - The return function
@param {function} errorCallBack - If there is an error
 */
CloudSaver.prototype.updateProject = function(projectID,
                                              projectName,
                                              applicationID,
                                              dataID,
                                              imgID,
                                              callBack,
                                              errorCallBack) {
    $.ajax({
      type: 'PUT',
      url: this.projAPIURL+projectID+'/',
      data: {
          name: projectName,
          description: '',
          classroom: null,
          application: applicationID,
          project: dataID,
          screenshot: imgID,
      },
      success: callBack,
      dataType: 'json',
  }).fail(errorCallBack);
};


/** Already got a project, no problem, just load it with this function
@param {int} projectID - ID of the number to be updated
@param {function} callBack - The return function
@param {function} errorCallBack - If there is an error
 */
CloudSaver.prototype.loadProject = function(projectID,
                                            callBack,
                                            errorCallBack) {
    $.get(this.projAPIURL + projectID + '/', null, function(data) {
      $.get(data.project_url, null,
        callBack).fail(errorCallBack);
    }).fail(errorCallBack);
};

/** Get the list of projects for the current user, must be signed in
@param {int} userID - ID of the number of user
@param {function} callBack - The return function
@param {function} errorCallBack - If there is an error
 */
CloudSaver.prototype.listProject = function(userID, callBack, errorCallBack) {
  $.get(this.projAPIURL+'?owner='+userID, null,
        callBack, 'json').fail(errorCallBack);
};

/** Signed in, but don't know which user you are, call this
@param {function} callBack - The return function
@param {function} errorCallBack - If there is an error
 */
CloudSaver.prototype.getUser = function(callBack, errorCallBack) {
   this.getCSRFToken();
   $.ajax({
      dataType: 'json',
      url: this.userAPIURL,
      success: callBack,
   }).fail(errorCallBack);
};


/** Don't want to bother writing your own login? Here is one that returns user
@param {function} callBack - The return function
@param {function} errorCallBack - If there is an error
 */
CloudSaver.prototype.loginPopup = function(callBack, errorCallBack) {
  let username = prompt('Enter your username', '');
  if (!username) {
    alert('No username entered, signin aborted');
    return;
  }
  let password = prompt('Hello ' + username + ', enter your password', '');
  if (!password) {
    alert('No password entered, signin aborted');
    return;
  }
  const myself = this;
  this.login(username, password, function(data) {
    myself.getUser(callBack, errorCallBack);
  },
    errorCallBack
  );
};
