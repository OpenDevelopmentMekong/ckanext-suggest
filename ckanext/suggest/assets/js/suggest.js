(function(_, jQuery) {
    'use strict';

    var timer = null;
    var currentFocus;
    var searchInput = $('#field-main-search').length > 0 ?
        $('#field-main-search') : $('#field-giant-search');

    var input = document.getElementById('field-main-search') ?
        document.getElementById('field-main-search') : document.getElementById('field-giant-search');

    var autocompleteItems = $('#autocomplete-list').find('div');

    var searchGroup = $('.search-giant').length > 0 ?
        $('.search-giant') : $('.search-input-group')

    var api = {
        get: function(action, params, async) {
            var api_ver = 3;
            var base_url = ckan.sandbox().client.endpoint;
            params = $.param(params);
            var url = base_url + '/api/' + api_ver + '/action/' + action + '?' + params;
            if (!async) {
                $.ajaxSetup({
                    async: false
                });
            }
            return $.getJSON(url);
        },
        post: function(action, data) {
            var api_ver = 3;
            var base_url = ckan.sandbox().client.endpoint;
            var url = base_url + '/api/' + api_ver + '/action/' + action;
            return $.post(url, data, 'json');
        }
    };

    function addActive(x) {
        // Add active class to active item in the list
        if (!x) return false;
        removeActive(x);
        if (currentFocus >= x.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = (x.length - 1);
        x[currentFocus].classList.add("autocomplete-active");
    }

    function removeActive(x) {
        // Remove active class from an item
        for (var i = 0; i < x.length; i++) {
            x[i].classList.remove("autocomplete-active");
        }
    }

    function closeAllLists(elmnt) {
        // Close all autocomplete lists in the document
        var x = document.getElementsByClassName("autocomplete-items");
        for (var i = 0; i < x.length; i++) {
            if (elmnt != x[i]) {
                x[i].parentNode.removeChild(x[i]);
            }
        }
        currentFocus = -1;
    }

    function main(event) {
        clearTimeout(timer)
        if (!(event.keyCode >= 13 && event.keyCode <= 20) && !(event.keyCode >= 37 &&
                event.keyCode <= 40) && event.keyCode != 27) {
            // detect that user has stopped typing for a while
            timer = setTimeout(function() {
                var q = searchInput.val();

                if (q !== '') {
                    // Get package type from parent element data attribute
                    var packageType = searchGroup.attr('data-package-type');
                    var params = {
                        'q': q
                    };
                    
                    // Add package type to params if available
                    if (packageType) {
                        params['package_type'] = packageType;
                    }

                    // Add current URL filters (facets) to params
                    if (window.URLSearchParams) {
                        var urlParams = new URLSearchParams(window.location.search);
                        urlParams.forEach(function(value, key) {
                            if (key !== 'q' && key !== 'package_type' && key !== 'sort' && key !== 'page') {
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
                    
                    api.get('suggest', params, true)
                        .done(function(suggestData) {
                            if (suggestData.result) {
                                var a, b;
                                var results = suggestData.result;

                                closeAllLists();

                                a = document.createElement("DIV");
                                a.setAttribute("id", "autocomplete-list");
                                a.setAttribute("class", "autocomplete-items");
                                searchInput.after(a);

                                results.forEach(function(r) {
                                    b = document.createElement("DIV");
                                    
                                    // Check if result is structured (has title, url) or just a string
                                    if (typeof r === 'object' && r.title) {
                                        // Structured result with title and URL
                                        var titleHtml = "<strong>" + r.title + "</strong>";
                                        if (r.type) {
                                            titleHtml += " <span class='suggestion-type'>(" + r.type + ")</span>";
                                        }
                                        if (r.document_number) {
                                            titleHtml += " <span class='suggestion-ref'>Ref: " + r.document_number.en + "</span>";
                                        } 
                                        b.innerHTML = titleHtml;
                                        
                                        // Store URL as data attribute for navigation
                                        if (r.url) {
                                            b.setAttribute('data-url', r.url);
                                        }
                                        
                                        b.addEventListener("click", function(e) {
                                            closeAllLists();
                                            var url = this.getAttribute('data-url');
                                            if (url) {
                                                // Navigate directly to the URL
                                                window.location.href = url;
                                            } else {
                                                // Fallback to populating search field
                                                searchInput.val(r.title);
                                                searchInput.trigger("change");
                                            }
                                        });
                                    } else {
                                        // Legacy string result
                                        b.innerHTML += "<strong>" + r + "</strong>";
                                        b.addEventListener("click", function(e) {
                                            closeAllLists();
                                            searchInput.val(r);
                                            searchInput.trigger("change");
                                        });
                                    }
                                    a.append(b)
                                });
                            }
                        })
                        .fail(function(error) {
                            console.log("Get suggestions: " + error.statusText);
                        });
                } else {
                    closeAllLists();
                }
            }, 300);

        }
    }

    $(document).ready(function() {
        currentFocus = -1;
        searchInput.bind("change keyup", event, main);
    });

    searchGroup.on('mouseover', autocompleteItems, function(e) {
        var activeItem = document.getElementsByClassName('autocomplete-active')[0];
        activeItem ? activeItem.classList.remove('autocomplete-active') : null;
        event.target !== input ? event.target.classList.add('autocomplete-active') : null;
        var p = e.target.parentElement;
        var index = Array.prototype.indexOf.call(p.children, e.target);
        activeItem ? currentFocus = index : currentFocus = -1
    });

    searchInput.on('keydown', function(e) {
        var x = document.getElementById("autocomplete-list");
        if (x) x = x.getElementsByTagName("div");

        if (e.keyCode == 40) {
            // The arrow DOWN key is pressed
            currentFocus++;
            addActive(x);
        } else if (e.keyCode == 38) {
            // The arrow UP key is pressed
            currentFocus--;
            addActive(x);
        } else if (e.keyCode == 13) {
            // ENTER key is pressed
            if (currentFocus > -1) {
                e.preventDefault();
                // Get the active item
                var activeItem = x[currentFocus];
                // Check if it has a URL for direct navigation
                var url = activeItem.getAttribute('data-url');
                if (url) {
                    // Navigate directly to the URL
                    window.location.href = url;
                } else {
                    // Fallback to simulating click
                    activeItem.click();
                }
            }
        } else if (e.keyCode == 27) {
            closeAllLists();
        }
    });
})(ckan.i18n.ngettext, $);
