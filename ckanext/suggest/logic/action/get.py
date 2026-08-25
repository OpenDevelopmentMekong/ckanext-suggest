import logging
import requests
from typing import List
from requests.auth import HTTPBasicAuth
from http.client import HTTPException

from ckan.logic import side_effect_free
from ckan.lib.search import SolrSettings
from ckan.common import _


log = logging.getLogger(__name__)


@side_effect_free
def suggest(context, data_dict):
    u'''Returns CKAN package search results as suggestions
    based on an input query (text) with optional filtering by package type
    
    :param q: The query term (required)
    :type q: str
    :param package_type: Filter suggestions by package type (optional)
    :type package_type: str
    :param limit: Maximum number of suggestions to return (optional)
    :type limit: int
    :returns: List of structured suggestions with title, type, url
    :rtype: list[dict]
    '''
    import ckan.plugins.toolkit as toolkit
    import ckan.lib.helpers as h

    query = data_dict.get('q')
    package_type = data_dict.get('package_type')
    limit = data_dict.get('limit', 10)
    lang = data_dict.get('lang', 'en')

    if not query:
        return []
    
    # We use package_search to get actual records matching the query.
    # NOTE: wildcard-phrase clauses like title:*"q"* ZERO the whole OR query
    # in this Solr (verified live, en + km) — never use them. id:*<q>* also
    # matches nothing (ids are uuids), so it is omitted. Infix + prefix
    # wildcards per field are what actually match.
    search_data = {
        'q': u'title:*{0}* OR title:{0}* OR name:*{0}* OR name:{0}* OR text:*{0}* OR text:{0}*'.format(query),
        'rows': limit,
        'sort': 'score desc, metadata_modified desc',
        'include_private': True
    }
    
    fq_list = []
    if package_type:
        fq_list.append(u'dataset_type:{}'.format(package_type))
        
    # Get all other parameters to use as filters
    known_params = ['q', 'package_type', 'limit', 'lang', 'suggest', 'build', 'callback', '_']
    for key, value in data_dict.items():
        if key not in known_params and value:
            # Handle list values if multiple same keys are passed
            if isinstance(value, list):
                or_conds = [u'{}:"{}"'.format(key, v) for v in value]
                fq_list.append(u'({})'.format(' OR '.join(or_conds)))
            else:
                fq_list.append(u'{}:"{}"'.format(key, value))
                
    if fq_list:
        search_data['fq'] = ' AND '.join(fq_list)
        
    try:
        search_result = toolkit.get_action('package_search')(context, search_data)
        
        results = []
        for pkg in search_result.get('results', []):
            pkg_type = pkg.get('type') or pkg.get('dataset_type', 'dataset')
            # Get translated title if available
            title_translated = pkg.get('title_translated', {})
            if isinstance(title_translated, dict) and lang in title_translated:
                title = title_translated[lang]
            else:
                title = pkg.get('title') or pkg.get('name')
            name = pkg.get('name')
            
            # Construct URL directly to the item
            try:
                # E.g. laws_record.read
                url = h.url_for(pkg_type + '.read', id=name)
            except:
                try:
                    url = h.url_for('dataset.read', id=name)
                except:
                    url = '/{}/{}'.format(pkg_type, name)
            
            # Determine the display type name
            display_type = pkg_type.replace('_', ' ').title()
            
            # Handle document number which may be a dict
            doc_number = pkg.get('odm_document_number', '')
            if isinstance(doc_number, dict):
                # Try to get language-specific version
                doc_number = doc_number.get(lang, doc_number.get('en', ''))
            
            results.append({
                'title': title,
                'type': display_type,
                'url': url,
                'source': 'package_search',
                'id': pkg.get('id', ''),
                'document_number': doc_number
            })
            
        return results
    except Exception as e:
        log.error(_("Suggest search failed: {}").format(e))
        return []


def _get_solr_suggest(do_suggest='true', build='false', query=None):
    u'''Makes a connection to SOLR suggester url and
    returns parsed result of the available suggestions
    based on the query term and can also be used to build
    the lookup data structure.

    :param do_suggest: parameter that tells solr
    whether to make suggestions or not (true or false)
    :type do_suggest: str
    :param build: parameter that tells solr
    whether to build the lookup data structure or not (true or false)
    :type build: str
    :param query: the query term to search for suggestions
    :type query: str
    :returns: List of suggestions
    :rtype: list[str]
    '''

    solr_url, solr_user, solr_password = SolrSettings.get()
    suggest_solr_url = solr_url + u'{}'.format(u'/suggest')
    params = {
        u'suggest': do_suggest,
        u'suggest.build': build,
        u'suggest.q': query,
        u'wt': u'json'
    }
    result = []

    try:
        response = requests.get(
            url=suggest_solr_url,
            params=params,
            auth=HTTPBasicAuth(solr_user,
                               solr_password),
            timeout=60,
            verify=True)
    except requests.exceptions.Timeout as e:
        log.error(u'Connection to server '
                  u'{} timed out: {}'.format(suggest_solr_url, e))
    except requests.exceptions.ConnectionError as e:
        log.error(u'Failed to connect '
                  u'to server at {}: {}'.format(suggest_solr_url, e))
    except HTTPException as e:
        log.error(u'Unhandled error: '
                  u'{}: {}'.format(suggest_solr_url, e))

    if response.status_code == 200:
        result = _parse_solr_response(query, response.json())
    else:
        log.error('Suggest request failed for url: {}, reason: {}.'
                  .format(suggest_solr_url, response.status_code))

    return result


def _parse_solr_response(q, solr_response):
    u'''Helper function that
    parses the SOLR response into a list of structured suggestions

    :param q: The query term
    :type q: str
    :returns: List of suggestion dictionaries with title, type, and url
    :rtype: list[dict]
    '''
    res = []
    suggest_root = solr_response.get('suggest', None)

    if suggest_root:
        # Parse title suggestions with metadata if available
        title_suggestions = []
        for item in suggest_root['datasetTitleSuggester'][q]['suggestions']:
            suggestion = {
                'title': item['term'],
                'type': 'dataset',
                'source': 'title'
            }
            # Include payload if available (could contain URL or ID)
            if 'payload' in item and item['payload']:
                suggestion['payload'] = item['payload']
            title_suggestions.append(suggestion)
        
        # Parse tag suggestions
        tags_suggestions = []
        for item in suggest_root['datasetTagsSuggester'][q]['suggestions']:
            suggestion = {
                'title': item['term'],
                'type': 'tag',
                'source': 'tag'
            }
            if 'payload' in item and item['payload']:
                suggestion['payload'] = item['payload']
            tags_suggestions.append(suggestion)
        
        # Combine suggestions (tags first, then titles)
        res = tags_suggestions + title_suggestions
        
        # Try to construct URLs for suggestions
        res = _enhance_suggestions_with_urls(res)

    return res


def _enhance_suggestions_with_urls(suggestions):
    u'''Enhance suggestions with URLs based on their type and content
    
    :param suggestions: List of suggestion dictionaries
    :type suggestions: list[dict]
    :returns: Enhanced suggestions with URLs
    :rtype: list[dict]
    '''
    import ckan.lib.helpers as h
    
    enhanced = []
    for suggestion in suggestions:
        # Create a copy to avoid modifying the original
        enhanced_suggestion = suggestion.copy()
        
        # Construct URL based on suggestion type
        if suggestion['type'] == 'dataset':
            # For dataset suggestions, create search URL or direct dataset URL
            # If we have a payload with dataset ID/name, use it
            if 'payload' in suggestion and suggestion['payload']:
                # Try to parse payload as JSON or use as-is
                try:
                    import json
                    payload_data = json.loads(suggestion['payload'])
                    if 'name' in payload_data:
                        # Construct dataset URL
                        enhanced_suggestion['url'] = h.url_for('dataset.read', id=payload_data['name'])
                    elif 'id' in payload_data:
                        enhanced_suggestion['url'] = h.url_for('dataset.read', id=payload_data['id'])
                except:
                    # If payload is not JSON, use it as search term
                    search_term = suggestion['payload']
                    enhanced_suggestion['url'] = h.url_for('dataset.search', q=search_term)
            else:
                # Fallback to search URL
                enhanced_suggestion['url'] = h.url_for('dataset.search', q=suggestion['title'])
                
        elif suggestion['type'] == 'tag':
            # For tag suggestions, create tag search URL
            enhanced_suggestion['url'] = h.url_for('dataset.search', tags=suggestion['title'])
        
        enhanced.append(enhanced_suggestion)
    
    return enhanced
