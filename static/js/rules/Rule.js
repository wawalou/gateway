/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

const API = require('../api');
const RuleUtils = require('./RuleUtils');
const TimeTriggerBlock = require('./TimeTriggerBlock');

/**
 * Model of a Rule loaded from the Rules Engine
 * @constructor
 * @param {Gateway} gateway - The remote gateway to which to talk
 * @param {RuleDescription?} desc - Description of the rule to load
 * @param {Function?} onUpdate - Listener for when update is called
 */
function Rule(gateway, desc, onUpdate) {
  this.gateway = gateway;
  this.onUpdate = onUpdate;

  if (desc) {
    this.id = desc.id;
    this.enabled = desc.enabled;
    if (desc.name) {
      this.name = desc.name;
    } else {
      this.name = 'Rule Name';
    }
    this.trigger = desc.trigger;
    this.effect = desc.effect;
  } else {
    this.enabled = true;
  }
}

/**
 * Validate and save the rule
 * @return {Promise}
 */
Rule.prototype.update = function() {
  if (this.onUpdate) {
    this.onUpdate();
  }
  const desc = this.toDescription();
  if (!desc) {
    return Promise.reject('invalid description');
  }

  const fetchOptions = {
    headers: API.headers(),
    method: 'PUT',
    body: JSON.stringify(desc),
  };
  fetchOptions.headers['Content-Type'] = 'application/json';

  let request = null;
  if (typeof this.id !== 'undefined') {
    request = fetch(`/rules/${encodeURIComponent(this.id)}`, fetchOptions);
  } else {
    fetchOptions.method = 'POST';
    request = fetch('/rules/', fetchOptions).then((res) => {
      return res.json();
    }).then((rule) => {
      this.id = rule.id;
    });
  }
  return request;
};

/**
 * Delete the rule
 * @return {Promise}
 */
Rule.prototype.delete = function() {
  const fetchOptions = {
    headers: API.headers(),
    method: 'DELETE',
  };

  if (typeof this.id === 'undefined') {
    return;
  }

  return fetch(`/rules/${encodeURIComponent(this.id)}`, fetchOptions);
};

/**
 * Convert this rule into a serialized description
 * @return {RuleDescription?} description or null if not a valid rule
 */
Rule.prototype.toDescription = function() {
  if (!this.trigger || !this.effect) {
    return null;
  }
  return {
    enabled: this.enabled,
    name: this.name,
    trigger: this.trigger,
    effect: this.effect,
  };
};

/**
 * Convert a trigger's decsription to a human-readable string
 * @param {Trigger} trigger
 * @param {boolean} html - whether to generate an interface
 * @return {String?}
 */
Rule.prototype.singleTriggerToHumanRepresentation = function(trigger, html) {
  if (!trigger) {
    return null;
  }

  if (trigger.type === 'MultiTrigger') {
    let triggerStr = '';
    for (let i = 0; i < trigger.triggers.length; i++) {
      if (i > 0) {
        if (trigger.triggers.length > 2) {
          triggerStr += ',';
        }
        triggerStr += ' ';
        if (i === trigger.triggers.length - 1) {
          if (html) {
            const andSelected = trigger.op === 'AND' ? 'selected' : '';
            const orSelected = trigger.op === 'OR' ? 'selected' : '';

            const selectHTML = `
              <span class="triangle-select-container">
                <select class="triangle-select rule-trigger-select">
                  <option ${andSelected}>and</option>
                  <option ${orSelected}>or</option>
                </select>
              </span>
            `;
            triggerStr += selectHTML;
          } else {
            triggerStr += trigger.op === 'AND' ? 'and ' : 'or ';
          }
        }
      }
      const singleStr =
        this.singleTriggerToHumanRepresentation(trigger.triggers[i], html);
      if (!singleStr) {
        return null;
      }
      triggerStr += singleStr;
    }
    return triggerStr;
  }

  if (trigger.type === 'TimeTrigger') {
    return `the time of day is ${
      TimeTriggerBlock.utcToLocal(trigger.time)}`;
  }

  if (trigger.type === 'EventTrigger') {
    const triggerThing = this.gateway.things.filter(
      RuleUtils.byHref(trigger.thing.href)
    )[0];
    if (!triggerThing) {
      return null;
    }
    return `${triggerThing.name} event "${trigger.event}" occurs`;
  }

  const triggerThing = this.gateway.things.filter(
    RuleUtils.byProperty(trigger.property)
  )[0];
  if (!triggerThing) {
    return null;
  }

  let triggerStr = `${triggerThing.name} `;
  if (trigger.type === 'BooleanTrigger') {
    triggerStr += 'is ';
    if (!trigger.onValue) {
      triggerStr += 'not ';
    }
    triggerStr += trigger.property.name;
  } else if (trigger.type === 'LevelTrigger') {
    triggerStr += `${trigger.property.name} is `;
    if (trigger.levelType === 'LESS') {
      triggerStr += 'less than ';
    } else {
      triggerStr += 'greater than ';
    }
    triggerStr += trigger.value;
  } else if (trigger.type === 'EqualityTrigger') {
    triggerStr += `${trigger.property.name} is ${trigger.value}`;
  } else {
    console.error('Unknown trigger type', trigger);
    return null;
  }

  return triggerStr;
};

/**
 * Convert an effect's description to a human-readable string
 * @param {Effect} effect
 * @return {String?}
 */
Rule.prototype.singleEffectToHumanRepresentation = function(effect) {
  if (!effect) {
    return null;
  }
  if (effect.type === 'MultiEffect') {
    let effectStr = '';
    for (let i = 0; i < effect.effects.length; i++) {
      if (i > 0) {
        if (effect.effects.length > 2) {
          effectStr += ',';
        }
        effectStr += ' ';
        if (i === effect.effects.length - 1) {
          effectStr += 'and ';
        }
      }
      const singleStr =
        this.singleEffectToHumanRepresentation(effect.effects[i]);
      if (!singleStr) {
        return null;
      }
      effectStr += singleStr;
    }
    return effectStr;
  }

  if (effect.type === 'ActionEffect') {
    const effectThing = this.gateway.things.filter(
      RuleUtils.byHref(effect.thing.href)
    )[0];
    if (!effectThing) {
      return null;
    }
    return `do ${effectThing.name} action "${effect.action}"`;
  }

  const effectThing = this.gateway.things.filter(
    RuleUtils.byProperty(effect.property)
  )[0];
  if (!effectThing) {
    return null;
  }

  let effectStr = '';
  if (effect.property.name === 'on') {
    effectStr = `turn ${effectThing.name} `;
    if (effect.value) {
      effectStr += 'on';
    } else {
      effectStr += 'off';
    }
  } else {
    effectStr += `set ${effectThing.name} ${effect.property.name} to `;
    effectStr += effect.value;
  }
  return effectStr;
};
/**
 * Convert the rule's description to human-readable plain text
 * @return {String}
 */
Rule.prototype.toHumanDescription = function() {
  return this.toHumanRepresentation(false);
};

/**
 * Convert the rule's description to a human-readable interface
 * @return {String}
 */
Rule.prototype.toHumanInterface = function() {
  return this.toHumanRepresentation(true);
};

/**
 * Convert the rule's description to a human-readable string
 * @param {boolean} html - whether an html interface
 * @return {String}
 */
Rule.prototype.toHumanRepresentation = function(html) {
  let triggerStr = '???';
  let effectStr = '???';

  if (this.trigger) {
    triggerStr =
      this.singleTriggerToHumanRepresentation(this.trigger, html) ||
      triggerStr;
  }
  if (this.effect) {
    effectStr =
      this.singleEffectToHumanRepresentation(this.effect) ||
      effectStr;
  }

  const effectExists = this.effect && this.effect.effects &&
    this.effect.effects.length > 0;
  let permanent = effectExists;
  for (const effect of this.effect.effects) {
    if (effect.type === 'SetEffect') {
      permanent = true;
      break;
    }
    if (effect.type === 'PulseEffect') {
      permanent = false;
      break;
    }
  }
  let predicate = permanent ? 'If' : 'While';
  if (html) {
    const permSelected = permanent ? 'selected' : '';
    const tempSelected = permanent ? '' : 'selected';
    predicate = `<span class="triangle-select-container">
      <select class="triangle-select rule-effect-select">
        <option ${permSelected}>If</option>
        <option ${tempSelected}>While</option>
      </select>
    </span>`;
  }

  return `${predicate} ${triggerStr}, ${effectStr}`;
};

/**
 * Set the trigger of the Rule, updating the server model if valid
 * @return {Promise}
 */
Rule.prototype.setTrigger = function(trigger) {
  this.trigger = trigger;
  return this.update();
};

/**
 * Set the effect of the Rule, updating the server model if valid
 * @return {Promise}
 */
Rule.prototype.setEffect = function(effect) {
  this.effect = effect;
  return this.update();
};

/**
 * Whether the rule is a valid, functioning rule
 * @return {boolean}
 */
Rule.prototype.valid = function() {
  return !!(this.singleTriggerToHumanRepresentation(this.trigger, false) &&
    this.singleEffectToHumanRepresentation(this.effect, false));
};

module.exports = Rule;
