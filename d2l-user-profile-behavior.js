import { D2LOrganizationHMMixin } from 'd2l-organization-hm-behavior';
import { Classes, Rels } from 'd2l-hypermedia-constants';
import SirenParse from 'siren-parser';

export const D2LUserProfileMixin = (superclass) => class extends D2LOrganizationHMMixin(superclass) {

	static get properties() {
		return {
			token: String,
			userUrl: String,
			options: {
				type: Object,
				value: function() { return {}; }
			},
			_doneRequests: {
				type: Boolean,
				value: false
			},
			_backgroundColor: {
				type: String,
				value: ''
			},
			_backgroundUrl: {
				type: String,
				value: ''
			},
			_name: {
				type: String,
				value: ''
			}
		};
	}

	updated(changedProperties) {
		if (changedProperties.has('_backgroundColor') || changedProperties.has('_backgroundUrl') || changedProperties.has('_name')) {
			this._checkDoneRequests();
		}
	}

	constructor() {
		super();
		this._rootUrl = '';
		this._enrollmentsUrl = '';
		this._folioUrl = '';
		this._iconUrl = '';
		this._previousUserCall = null;
	}

	_checkDoneRequests() {
		var backgroundExists = !!(this._backgroundUrl || this._backgroundColor);
		var backgroundNeeded = (this.options || {}).background;
		var doneRequests = (!backgroundNeeded || backgroundExists) && !!this._name;

		if (doneRequests) {
			if (this._backgroundUrl) {
				// preload the image a bit so after the fade-in it's hopefully loaded
				var self = this;
				var setLoaded = function() {
					self._doneRequests = true;
				};
				var imagePreloader = document.createElement('img');
				imagePreloader.addEventListener('load', setLoaded);
				imagePreloader.addEventListener('error', setLoaded);
				imagePreloader.setAttribute('src', self._backgroundUrl);
			}

			this._doneRequests = true;
		}
	}

	async generateUserRequest(userUrl, token, options) {
		this._previousUserCall = this._previousUserCall || {};
		this._doneRequests = false;
		let res = false;

		if (
			userUrl &&
			token &&
			userUrl !== this._previousUserCall.userUrl &&
			token !== this._previousUserCall.token
		) {
			this._rootUrl = '';
			this._enrollmentsUrl = '';
			this._folioUrl = '';
			this._iconUrl = '';
			this._backgroundColor = 'initial';
			this._backgroundUrl = '';
			this._name = '';
			this.userUrl = userUrl || this.userUrl;
			this.token = token || this.token;
			this.options = options || this.options;
			this._previousUserCall = { userUrl: this.userUrl, token: this.token };

			const userSuccess = await this._fetchUser();
			if (userSuccess) {
				res = await this._getBackgroundFromUsersLatestFolioEvidence() || await this._getBackgroundFromUsersFirstCourse() || await this._getInstitutionThemeBackground();
			}
		}

		return !!res;
	}

	async _getBackgroundFromUsersLatestFolioEvidence() {
		return await this._fetchFolio();
	}

	async _getBackgroundFromUsersFirstCourse() {
		let res = false;

		const organizationUrl = await this._fetchEnrollments();
		if (organizationUrl) {
			const organizationImageUrl = await this._fetchOrganization(organizationUrl);
			if (organizationImageUrl) {
				res = await this._fetchOrganizationImage(organizationImageUrl);
			}
		}
		return !!res;
	}

	async _getInstitutionThemeBackground() {
		let res = false;

		const institutionUrl = await this._fetchRoot();
		if (institutionUrl) {
			const themeUrl = await this._fetchInstitution(institutionUrl);
			if (themeUrl) {
				res = await this._fetchTheme(themeUrl);
			}
		}
		return !!res;
	}

	async _fetchSirenEntity(url) {
		var request = new Request(url, {
			headers: new Headers({
				accept: 'application/vnd.siren+json',
				authorization: 'Bearer ' + this.token
			})
		});

		const response = await window.d2lfetch.fetch(request);
		if (response.ok) {
			return SirenParse(await response.json());
		}
		return false;
	}

	async _fetchUser() {
		const userEntity = await this._fetchSirenEntity(this.userUrl);

		if (userEntity) {
			this._rootUrl = (userEntity.getLinkByRel(Rels.root) || {}).href;
			this._enrollmentsUrl = (userEntity.getLinkByRel(Rels.myEnrollments) || {}).href;
			this._folioUrl = (userEntity.getLinkByRel(Rels.Folio.folio) || {}).href;

			var displayNameEntity = userEntity.getSubEntityByRel(Rels.displayName);
			if (displayNameEntity) {
				this._name = displayNameEntity.properties && displayNameEntity.properties.name;
			}

			var profileEntity = userEntity.getSubEntityByRel(Rels.userProfile);
			if (profileEntity) {
				var image = profileEntity.getSubEntityByRel(Rels.profileImage);

				if (image.class && image.class.indexOf('default-image') !== -1) {
					this._iconUrl = null;
				} else {
					this._iconUrl = (image.getLinkByRel(Rels.thumbnailRegular) || {}).href;
				}
			}
		}
		return !!userEntity;
	}

	async _fetchFolio() {
		if (!this.options || !this.options.background) {
			return false;
		}

		if (!this._folioUrl) {
			return false;
		}

		const folioEntity = await this._fetchSirenEntity(this._folioUrl);
		if (folioEntity) {
			var tiles = (folioEntity.getSubEntitiesByRel(Rels.Folio.evidence));
			for (var i = 0; i < tiles.length; i++) {
				var content = tiles[i].getSubEntityByRel(Rels.Folio.contentItem);
				var type = content.properties.type;
				switch (type) {
					case 'Png':
					case 'Jpg':
					case 'Gif':
						this._backgroundUrl = content.properties.url;
						return true;
				}
			}
		}
		return false;
	}

	async _fetchEnrollments() {
		if (!this._enrollmentsUrl) {
			return false;
		}

		this._enrollmentsUrl += '?pageSize=2&orgUnitTypeId=3&embedDepth=1';
		const enrollmentsEntity = await this._fetchSirenEntity(this._enrollmentsUrl);
		if (enrollmentsEntity) {
			var enrollmentEntities = enrollmentsEntity.getSubEntitiesByRel(Rels.userEnrollment);

			if (enrollmentEntities.length === 1) {
				var organizationUrl = enrollmentEntities[0].getLinkByRel(Rels.organization).href;
				return organizationUrl;
			}
		}
		return false;
	}

	async _fetchOrganization(organizationUrl) {
		const organizationEntity = await this._fetchSirenEntity(organizationUrl);
		if (organizationEntity) {
			var imageLink = organizationEntity.getSubEntityByClass(Classes.courseImage.courseImage);

			if (!imageLink) {
				return false;
			}

			var organizationImageUrl = imageLink.href;
			return organizationImageUrl;
		}
		return false;
	}

	async _fetchOrganizationImage(organizationImageUrl) {
		const organizationImageEntity = await this._fetchSirenEntity(organizationImageUrl);
		if (organizationImageEntity) {
			var backgroundImages = this._getBestImageLinks(organizationImageEntity, Classes.courseImage.wide);
			this._backgroundUrl = backgroundImages.highMin || backgroundImages.lowMax;
		}
		return !!organizationImageEntity;
	}

	async _fetchRoot() {
		if (!this._rootUrl) {
			return false;
		}

		const rootEntity = await this._fetchSirenEntity(this._rootUrl);

		if (rootEntity) {
			var institutionUrl = (rootEntity.getLinkByRel(Rels.organization) || {}).href;
			return institutionUrl;
		}
		return false;
	}

	async _fetchInstitution(institutionUrl) {
		const institutionEntity = await this._fetchSirenEntity(institutionUrl);
		if (institutionEntity) {
			var themeUrl = (institutionEntity.getLinkByRel(Rels.Themes.theme) || {}).href;
			return themeUrl;
		}
		return false;
	}

	async _fetchTheme(themeUrl) {
		const themeEntity = await this._fetchSirenEntity(themeUrl);
		if (themeEntity) {
			if (themeEntity.properties) {
				this._backgroundColor = themeEntity.properties.BackgroundColor;
				return !!themeEntity;
			}
		}
		return false;
	}
};
