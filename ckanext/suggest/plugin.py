import ckan.plugins as plugins
import ckan.plugins.toolkit as toolkit
import os

from ckanext.suggest.logic.action.get import suggest
import ckanext.suggest.cli as cli


try:
    from ckan.lib.plugins import DefaultTranslation
except ImportError:
    class DefaultTranslation:
        pass


class SuggestPlugin(plugins.SingletonPlugin, DefaultTranslation):
    plugins.implements(plugins.IConfigurer)
    plugins.implements(plugins.IActions)
    plugins.implements(plugins.IClick)
    plugins.implements(plugins.ITranslation)

    # IConfigurer

    def update_config(self, config_):
        toolkit.add_template_directory(config_, 'templates')
        toolkit.add_public_directory(config_, 'public')
        toolkit.add_resource('assets', 'suggest')

    # IActions

    def get_actions(self):
        return {
            u'suggest': suggest
        }

    # IClick

    def get_commands(self):
        return cli.get_commands()

    # ITranslation
    def i18n_directory(self):
        '''Change the directory of the .mo translation files'''
        return os.path.join(
            os.path.dirname(__file__),
            'i18n'
        )
