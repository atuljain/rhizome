from tastypie.test import ResourceTestCase
from django.contrib.auth.models import User
from datapoints.models import CustomDashboard, CustomChart

import json

class DashboardResourceTest(ResourceTestCase):
    def setUp(self):
        super(DashboardResourceTest, self).setUp()

        # Create a user.
        self.username = 'john'
        self.password = 'pass'
        self.user = User.objects.create_user(self.username,
                                             'john@john.com', self.password)

        self.get_credentials()

        # create their api_key

    def get_credentials(self):
        result = self.api_client.client.login(username=self.username,
                                              password=self.password)
        return result

    def test_dashboard_post(self):
        post_data = {'title': 'the dashboard title'}
        CustomDashboard.objects.all().delete()
        self.assertEqual(CustomDashboard.objects.count(), 0)

        resp = self.api_client.post('/api/v1/custom_dashboard/', format='json', \
                                    data=post_data, authentication=self.get_credentials())
        response_data = self.deserialize(resp)

        self.assertHttpCreated(resp)
        self.assertEqual(post_data['title'], response_data['title'])
        self.assertEqual(CustomDashboard.objects.count(), 1)

    def test_dashboard_name_exist(self):
        dashboard_name = "test the already exists"

        CustomDashboard.objects.all().delete()
        self.assertEqual(CustomDashboard.objects.count(), 0)

        post_data = {'title': dashboard_name}
        resp = self.api_client.post('/api/v1/custom_dashboard/', format='json', \
                                    data=post_data, authentication=self.get_credentials())
        self.assertEqual(CustomDashboard.objects.count(), 1)

        resp = self.api_client.post('/api/v1/custom_dashboard/', format='json', \
                                    data=post_data, authentication=self.get_credentials())
        response_data = self.deserialize(resp)

        self.assertHttpApplicationError(resp)
        self.assertEqual(CustomDashboard.objects.count(), 1)
        self.assertEqual('the custom dashboard "{0}" already exists'.format(dashboard_name), response_data['error'])

    def test_delete_dashboard(self):
        dashboard_name = "test delete a dashboard"

        # Create the custom dashboard
        CustomDashboard.objects.all().delete()
        self.assertEqual(CustomDashboard.objects.count(), 0)

        dashboard = CustomDashboard.objects.create(title=dashboard_name, owner_id=self.user.id, default_office_id=1, layout=1)
        self.assertEqual(CustomDashboard.objects.count(), 1)

        # Create the custom charts
        CustomChart.objects.all().delete()
        self.assertEqual(CustomChart.objects.count(), 0)

        chart_json = json.dumps({'foo1': 'bar1'})
        CustomChart.objects.create(dashboard_id=dashboard.id, chart_json=chart_json)
        chart_json = json.dumps({'foo2': 'bar2'})
        CustomChart.objects.create(dashboard_id=dashboard.id, chart_json=chart_json)
        self.assertEqual(CustomChart.objects.count(), 2)

        delete_url = '/api/v1/custom_dashboard/?id=' + str(dashboard.id)

        self.api_client.delete(delete_url, format='json', data={}, authentication=self.get_credentials())

        self.assertEqual(CustomChart.objects.count(), 0)
        self.assertEqual(CustomDashboard.objects.count(), 0)
