import { LitElement } from 'lit-element';
import { D2LUserProfileMixin } from '../d2l-user-profile-behavior.js';

export class ConsumerElement extends D2LUserProfileMixin(LitElement) {

}

customElements.define('consumer-element', ConsumerElement);
