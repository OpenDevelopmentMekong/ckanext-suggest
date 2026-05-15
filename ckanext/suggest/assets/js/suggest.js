(function (_, jQuery) {
  "use strict";

  var timer = null;
  var currentFocus;
  var searchInput;
  var input;
  var searchGroup;

  var api = {
    get: function (action, params, async) {
      var api_ver = 3;
      var base_url = ckan.sandbox().client.endpoint;
      params = $.param(params);
      var url =
        base_url + "/api/" + api_ver + "/action/" + action + "?" + params;
      if (!async) {
        $.ajaxSetup({
          async: false,
        });
      }
      return $.getJSON(url);
    },
    post: function (action, data) {
      var api_ver = 3;
      var base_url = ckan.sandbox().client.endpoint;
      var url = base_url + "/api/" + api_ver + "/action/" + action;
      return $.post(url, data, "json");
    },
  };

  function addActive(x) {
    if (!x) return false;
    $(".autocomplete-active").removeClass("autocomplete-active");
    if (currentFocus >= x.length) currentFocus = 0;
    if (currentFocus < 0) currentFocus = x.length - 1;
    x[currentFocus].classList.add("autocomplete-active");
  }

  function removeActive(x) {
    for (var i = 0; i < x.length; i++) {
      x[i].classList.remove("autocomplete-active");
    }
  }

  function closeAllLists(elmnt) {
    var x = document.getElementsByClassName("autocomplete-items");
    for (var i = 0; i < x.length; i++) {
      if (elmnt != x[i]) {
        x[i].parentNode.removeChild(x[i]);
      }
    }
    currentFocus = -1;
  }

  function main(event) {
    clearTimeout(timer);
    if (
      !(event.keyCode >= 13 && event.keyCode <= 20) &&
      !(event.keyCode >= 37 && event.keyCode <= 40) &&
      event.keyCode != 27
    ) {
      timer = setTimeout(function () {
        var q = searchInput.val();

        if (q !== "") {
          var packageType = searchGroup.attr("data-package-type");
          var params = {
            q: q,
          };

          var lang = document.documentElement.lang || "en";
          if (lang.length > 2) {
            lang = lang.substring(0, 2);
          }
          params["lang"] = lang;

          if (packageType) {
            params["package_type"] = packageType;
          }

          if (window.URLSearchParams) {
            var urlParams = new URLSearchParams(window.location.search);
            urlParams.forEach(function (value, key) {
              if (
                key !== "q" &&
                key !== "package_type" &&
                key !== "sort" &&
                key !== "page"
              ) {
                if (params[key]) {
                  if (Array.isArray(params[key])) {
                    params[key].push(value);
                  } else {
                    params[key] = [params[key], value];
                  }
                } else {
                  params[key] = value;
                }
              }
            });
          }

          api
            .get("suggest", params, true)
            .done(function (suggestData) {
              if (suggestData.result && suggestData.result.length > 0) {
                var a, b;
                var results = suggestData.result;

                closeAllLists();

                a = document.createElement("DIV");
                a.setAttribute("id", "autocomplete-list");
                a.setAttribute("class", "autocomplete-items");
                searchInput.after(a);

                results.forEach(function (r) {
                  b = document.createElement("DIV");

                  if (typeof r === "object" && r.title) {
                    var titleHtml = "<strong>" + r.title + "</strong>";
                    if (r.type) {
                      titleHtml +=
                            " <span class='suggestion-type'>(Document Type: " +
                        r.type +
                        ")</span>";
                    }
                    if (r.document_number) {
                      var docNum = r.document_number;
                      if (typeof docNum === "object") {
                        var lang = params["lang"] || "en";
                        docNum = docNum[lang] || docNum["en"] || "";
                      }
                      if (docNum) {
                        titleHtml +=
                          " <span class='suggestion-ref'>Ref: " +
                          docNum +
                          "</span>";
                      }
                    }
                    b.innerHTML = titleHtml;

                    if (r.url) {
                      b.setAttribute("data-url", r.url);
                    }

                    b.addEventListener("click", function (e) {
                      closeAllLists();
                      var url = this.getAttribute("data-url");
                      if (url) {
                        window.location.href = url;
                      } else {
                        searchInput.val(r.title);
                        searchInput.trigger("change");
                      }
                    });
                  } else {
                    b.innerHTML += "<strong>" + r + "</strong>";
                    b.addEventListener("click", function (e) {
                      closeAllLists();
                      searchInput.val(r);
                      searchInput.trigger("change");
                    });
                  }
                  a.append(b);
                });
              }
            })
            .fail(function (error) {
              console.log("Get suggestions: " + error.statusText);
            });
        } else {
          closeAllLists();
        }
      }, 300);
    }
  }

  $(document).ready(function () {
    currentFocus = -1;

    searchInput =
      $("#field-main-search").length > 0
        ? $("#field-main-search")
        : $("#field-giant-search");

    input = document.getElementById("field-main-search")
      ? document.getElementById("field-main-search")
      : document.getElementById("field-giant-search");

    searchGroup =
      $(".search-giant").length > 0
        ? $(".search-giant")
        : $(".search-input-group");

    searchInput.bind("change keyup", main);

    $(document).on("click", function (e) {
      closeAllLists(e.target);
    });
  });

  $(document).on("mouseover", ".autocomplete-items div", function () {
    $(".autocomplete-active").removeClass("autocomplete-active");
    $(this).addClass("autocomplete-active");
    var items = $(this).parent().find("div");
    currentFocus = items.index(this);
  });

  $(document).on("keydown", "#field-main-search, #field-giant-search", function (e) {
    var x = document.getElementById("autocomplete-list");
    if (x) x = x.getElementsByTagName("div");

    if (e.keyCode == 40) {
      currentFocus++;
      addActive(x);
    } else if (e.keyCode == 38) {
      currentFocus--;
      addActive(x);
    } else if (e.keyCode == 13) {
      if (currentFocus > -1) {
        e.preventDefault();
        var activeItem = x[currentFocus];
        var url = activeItem.getAttribute("data-url");
        if (url) {
          window.location.href = url;
        } else {
          activeItem.click();
        }
      }
    } else if (e.keyCode == 27) {
      closeAllLists();
    }
  });
})(ckan.i18n.ngettext, $);
