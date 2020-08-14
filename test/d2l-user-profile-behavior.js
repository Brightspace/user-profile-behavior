import SirenParse from 'siren-parser';

describe('d2l-user-profile-behavior', function() {
	var component,
		sandbox;

	function stubFetchEntity(entity) {
		var parsed = SirenParse(entity);
		sandbox.stub(component, '_fetchSirenEntity').returns(Promise.resolve(parsed));
	}

	beforeEach(function() {
		component = fixture('default-fixture');
		sandbox = sinon.sandbox.create();
	});

	afterEach(function() {
		sandbox.restore();
	});

	it('should be properly imported by a consumer', function() {
		expect(component.generateUserRequest).to.be.an.instanceof(Function);
	});

	describe('generateUserRequest', function() {
		it('should not redo a call with the same URL/token', function() {
			component._previousUserCall = {
				userUrl: 'foo',
				token: 'bar'
			};

			var spy = sandbox.spy(component, '_fetchUser');
			return component.generateUserRequest('foo', 'bar').then(function() {
				expect(spy).to.have.not.been.called;
			});
		});

		it('should call _fetchUser when token/URL are new', function() {
			var spy = sandbox.stub(component, '_fetchUser').returns(Promise.resolve());
			return component.generateUserRequest('foo', 'bar').then(function() {
				expect(spy).to.have.been.called;
			});
		});

		describe('request flow', function() {
			beforeEach(function() {
				sandbox.stub(component, '_fetchUser').returns(Promise.resolve(true));
			});

			it('should try to call folio first', function() {
				var spy = sandbox.spy(component, '_fetchFolio');

				return component.generateUserRequest('foo', 'bar').then(function() {
					expect(spy).to.have.been.called;
				});
			});

			it('should call enrollments -> organization -> organizationImage if folio flow fails', function() {
				sandbox.stub(component, '_fetchFolio').returns(Promise.resolve(false));
				var enrollmentsStub = sandbox.stub(component, '_fetchEnrollments').returns(Promise.resolve(true));
				var organizationStub = sandbox.stub(component, '_fetchOrganization').returns(Promise.resolve(true));
				var organizationImageStub = sandbox.stub(component, '_fetchOrganizationImage').returns(Promise.resolve(true));

				return component.generateUserRequest('foo', 'bar').then(function() {
					expect(enrollmentsStub).to.have.been.called;
					expect(organizationStub).to.have.been.called;
					expect(organizationImageStub).to.have.been.called;
				});
			});

			it('should call root -> institution -> theme if organizationImage flow fails', function() {
				sandbox.stub(component, '_fetchFolio').returns(Promise.resolve(false));
				sandbox.stub(component, '_fetchEnrollments').returns(Promise.resolve(false));
				var rootStub = sandbox.stub(component, '_fetchRoot').returns(Promise.resolve(true));
				var institutionStub = sandbox.stub(component, '_fetchInstitution').returns(Promise.resolve(true));
				var themeStub = sandbox.stub(component, '_fetchTheme').returns(Promise.resolve(true));

				return component.generateUserRequest('foo', 'bar').then(function() {
					expect(rootStub).to.have.been.called;
					expect(institutionStub).to.have.been.called;
					expect(themeStub).to.have.been.called;
				});
			});

			it('should set the background to "initial" if everything fails', function() {
				sandbox.stub(component, '_fetchFolio').returns(Promise.reject(false));
				sandbox.stub(component, '_fetchEnrollments').returns(Promise.reject(false));
				sandbox.stub(component, '_fetchRoot').returns(Promise.reject(false));

				expect(component._backgroundColor).to.equal(undefined);
				component.generateUserRequest('foo', 'bar').then(function() {
					expect(component._backgroundColor).to.equal('initial');
				});
			});
		});
	});

	describe('_fetchUser', function() {
		it('should set the root, enrollments, and folio URLs', function() {
			stubFetchEntity({
				links: [{
					rel: ['https://api.brightspace.com/rels/root'],
					href: 'foo'
				}, {
					rel: ['https://api.brightspace.com/rels/my-enrollments'],
					href: 'bar'
				}, {
					rel: ['https://folio.api.brightspace.com/rels/folio'],
					href: 'baz'
				}]
			});

			return component._fetchUser().then(function() {
				expect(component._rootUrl).to.equal('foo');
				expect(component._enrollmentsUrl).to.equal('bar');
				expect(component._folioUrl).to.equal('baz');
			});
		});

		it('should set _name from the display name subentity', function() {
			stubFetchEntity({
				entities: [{
					rel: ['https://api.brightspace.com/rels/display-name'],
					properties: {
						name: 'foo'
					}
				}]
			});

			return component._fetchUser().then(function() {
				expect(component._name).to.equal('foo');
			});
		});

		it('should set the _iconUrl from the profile image subentity', function() {
			stubFetchEntity({
				entities: [{
					rel: ['https://api.brightspace.com/rels/user-profile'],
					entities: [{
						rel: ['https://api.brightspace.com/rels/profile-image'],
						links: [{
							rel: ['https://api.brightspace.com/rels/thumbnail#regular'],
							href: 'foo'
						}]
					}]
				}]
			});

			return component._fetchUser().then(function() {
				expect(component._iconUrl).to.equal('foo');
			});
		});
	});

	describe('_fetchFolio', function() {
		function createFolioEvidence(contentType) {
			return {
				entities: [{
					rel: ['https://folio.api.brightspace.com/rels/Evidence'],
					entities: [{
						rel: ['https://folio.api.brightspace.com/rels/Content'],
						properties: {
							type: contentType,
							url: 'foo'
						}
					}]
				}]
			};
		}

		beforeEach(function() {
			component.options = {
				background: true
			};
			component._folioUrl = 'foo';
		});

		it('should not do anything if we do not need a background image', function() {
			var spy = sandbox.spy(component, '_fetchSirenEntity');
			component.options = {};

			return component._fetchFolio().then(function() {
				expect(spy).to.have.not.been.called;
			});
		});

		it('should reject if the folio URL has not been set', function() {
			component._folioUrl = undefined;
			return component._fetchFolio().then(function(res) {
				expect(res).to.equal(false);
				// expect(e.message).to.equal('Folio URL not set');
			});
		});

		it('should reject if no adequate folio evidence is found (Jpg, Png, or Gif)', function() {
			stubFetchEntity(createFolioEvidence('Text'));

			return component._fetchFolio().then(function(res) {
				expect(res).to.equal(false);
				expect(component._backgroundUrl).to.not.equal('foo');
			});
		});

		it('should set the _backgroundUrl if adequate folio evidence is found (Jpg)', function() {
			stubFetchEntity(createFolioEvidence('Jpg'));

			return component._fetchFolio().then(function() {
				expect(component._backgroundUrl).to.equal('foo');
			});
		});

		it('should set the _backgroundUrl if adequate folio evidence is found (Png)', function() {
			stubFetchEntity(createFolioEvidence('Png'));

			return component._fetchFolio().then(function() {
				expect(component._backgroundUrl).to.equal('foo');
			});
		});

		it('should set the _backgroundUrl if adequate folio evidence is found (Gif)', function() {
			stubFetchEntity(createFolioEvidence('Gif'));

			return component._fetchFolio().then(function() {
				expect(component._backgroundUrl).to.equal('foo');
			});
		});
	});

	describe('_fetchEnrollments', function() {
		beforeEach(function() {
			component._enrollmentsUrl = 'foo';
		});

		it('should reject if the enrollments URL has not been set', function() {
			var spy = sandbox.spy(component, '_fetchSirenEntity');
			component._enrollmentsUrl = undefined;

			return component._fetchEnrollments().then(function(res) {
				expect(res).to.equal(false);
				expect(spy).to.have.not.been.called;
			});
		});

		it('should reject if user has no enrollments', function() {
			stubFetchEntity({});
			return component._fetchEnrollments().then(function(res) {
				expect(res).to.equal(false);
			});
		});

		it('should reject if user has >1 enrollments', function() {
			stubFetchEntity({
				entities: [{
					rel: ['https://api.brightspace.com/rels/user-enrollment']
				}, {
					rel: ['https://api.brightspace.com/rels/user-enrollment']
				}]
			});

			return component._fetchEnrollments().then(function(res) {
				expect(res).to.equal(false);
			});
		});

		it('should resolve with the organization URL if user has exactly one enrollment', function() {
			stubFetchEntity({
				entities: [{
					rel: ['https://api.brightspace.com/rels/user-enrollment'],
					links: [{
						rel: ['https://api.brightspace.com/rels/organization'],
						href: 'foo'
					}]
				}]
			});

			return component._fetchEnrollments().then(function(organizationUrl) {
				expect(organizationUrl).to.equal('foo');
			});
		});
	});

	describe('_fetchOrganization', function() {
		it('should reject if there is no organization image link', function() {
			stubFetchEntity({
				entities: [{
					href: 'foo',
					rel: ['bar'],
					class: ['not-course-image']
				}]
			});

			return component._fetchOrganization().then(function(res) {
				expect(res).to.equal(false);
			});
		});

		it('should resolve with the organization image URL', function() {
			stubFetchEntity({
				entities: [{
					href: 'foo',
					rel: ['bar'],
					class: ['course-image']
				}]
			});

			return component._fetchOrganization().then(function(imageUrl) {
				expect(imageUrl).to.equal('foo');
			});
		});
	});

	describe('_fetchOrganizationImage', function() {
		it('should resolve and set the _backgroundUrl appropriately', function() {
			stubFetchEntity({
				links: [{
					rel: ['alternate'],
					class: ['wide', 'min', 'high-density'],
					href: 'foo'
				}]
			});

			return component._fetchOrganizationImage().then(function() {
				expect(component._backgroundUrl).to.equal('foo');
			});
		});
	});

	describe('_fetchRoot', function() {
		beforeEach(function() {
			component._rootUrl = 'foo';
		});

		it('should reject if the root URL is not set', function() {
			var spy = sandbox.spy(component, '_fetchSirenEntity');
			component._rootUrl = undefined;

			return component._fetchRoot().then(function(res) {
				expect(res).to.equal(false);
				expect(spy).to.have.not.been.called;
			});
		});

		it('should resolve with the institution URL', function() {
			stubFetchEntity({
				links: [{
					rel: ['https://api.brightspace.com/rels/organization'],
					href: 'foo'
				}]
			});

			return component._fetchRoot().then(function(institutionUrl) {
				expect(institutionUrl).to.equal('foo');
			});
		});
	});

	describe('_fetchInstitution', function() {
		it('should resolve with the theme URL', function() {
			stubFetchEntity({
				links: [{
					rel: ['https://themes.api.brightspace.com/rels/theme'],
					href: 'foo'
				}]
			});

			return component._fetchInstitution().then(function(themeUrl) {
				expect(themeUrl).to.equal('foo');
			});
		});
	});

	describe('_fetchTheme', function() {
		it('should reject if the theme colour is not returned', function() {
			stubFetchEntity({});

			return component._fetchTheme().then(function(res) {
				expect(res).to.equal(false);
			});
		});

		it('should set the _backgroundColor appropriately', function() {
			stubFetchEntity({
				properties: {
					BackgroundColor: 'foo'
				}
			});

			return component._fetchTheme().then(function() {
				expect(component._backgroundColor).to.equal('foo');
			});
		});
	});
});
