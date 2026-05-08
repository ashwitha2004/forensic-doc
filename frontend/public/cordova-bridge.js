/**
 * Enhanced Cordova Bridge for Capacitor + Cordova Plugins
 * This bridges the gap between Capacitor (modern) and Cordova plugins (legacy)
 * Allows Cordova plugins to work in Capacitor Android environment
 * 
 * CRITICAL FIX: Properly invoke Capacitor plugins without falling back to window.prompt()
 */

// Execute counter for tracking async calls
let execUriCounter = 0;

// Cordova-compatible object
const cordova = {
  _channels: {},
  _callbackMap: {},
  _executors: {},
  _callbackId: 0,
  
  // Initialize Cordova
  require: function(id) {
    return require(id);
  },

  // Main exec function - routes to native Android through Capacitor
  exec: function(success, fail, service, action, args) {
    console.log(`\n🔗 [CORDOVA EXEC] Calling native plugin`);
    console.log(`   Service: ${service}`);
    console.log(`   Action: ${action}`);
    console.log(`   Args:`, args);
    
    // Convert args array to proper format for native
    const params = args && args.length > 0 ? args[0] : {};
    
    // Use Capacitor to invoke the plugin
    // Capacitor plugins are loaded and available in Android WebView
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      console.log('   ✅ Capacitor native platform detected');
      // Capacitor should handle plugin execution automatically
      // The Cordova plugin should be invoked through Capacitor's registered plugins
      invokeCapacitorPlugin(success, fail, service, action, params);
    } else if (window.Capacitor) {
      console.log('   ⚡ Capacitor available (may not be on native platform)');
      invokeCapacitorPlugin(success, fail, service, action, params);
    } else if (window.cordova) {
      console.log('   📱 Native Cordova available');
      // Fallback to native cordova if available
      window.cordova.exec(success, fail, service, action, [params]);
    } else {
      const errorMsg = `Native bridge not available. Service: ${service}, Action: ${action}`;
      console.error('❌ ' + errorMsg);
      if (fail) fail(errorMsg);
    }
  },

  // Callback handlers called from native side
  callback: function(callbackId, success, result) {
    console.log(`   📨 Callback received: ${callbackId}, success: ${success}, result:`, result);
    const callbacks = cordova._callbackMap[callbackId];
    if (callbacks) {
      if (success && callbacks.success) {
        callbacks.success(result);
      } else if (!success && callbacks.fail) {
        callbacks.fail(result);
      }
      delete cordova._callbackMap[callbackId];
    } else {
      console.warn(`   ⚠️ No callback found for ID: ${callbackId}`);
    }
  },

  // Define a Cordova module
  define: function(id, factory) {
    cordova.modules = cordova.modules || {};
    cordova.modules[id] = { factory: factory, exports: {} };
  },

  // Require a module
  require: function(id) {
    const module = cordova.modules && cordova.modules[id];
    if (!module) throw new Error('Module not found: ' + id);
    if (!module.exports) {
      module.exports = module.factory.call(this);
    }
    return module.exports;
  }
};

/**
 * Invoke Capacitor plugin
 * Capacitor handles plugin execution on native side
 */
async function invokeCapacitorPlugin(success, fail, service, action, params) {
  try {
    console.log(`   🔄 Invoking via Capacitor: ${service}.${action}`);
    
    // In Capacitor, Cordova plugins are registered and invoked through pluginClassMap
    // The service name is the plugin class name
    const callbackId = 'cordova_' + (cordova._callbackId++) + '_' + Date.now();
    
    // Store the callbacks
    cordova._callbackMap[callbackId] = {
      success: success,
      fail: fail,
      callbackId: callbackId
    };
    
    // Capacitor's invoke method for Cordova plugins
    // This will use the native bridge to call the Cordova plugin
    if (window.Capacitor.Plugins) {
      // Capacitor v3+
      console.log(`   📦 Trying Capacitor.Plugins approach`);
      
      // Create a direct native call callback wrapper
      const wrappedSuccess = (result) => {
        console.log(`   ✅ Success response for ${service}.${action}:`, result);
        cordova.callback(callbackId, true, result);
      };
      
      const wrappedFail = (error) => {
        console.log(`   ❌ Error response for ${service}.${action}:`, error);
        cordova.callback(callbackId, false, error);
      };
      
      // Call through raw Channel API if available (Capacitor internal)
      if (window.Capacitor.Channels &&  window.Capacitor.Channels[service]) {
        const channel = window.Capacitor.Channels[service];
        channel.invoke(action, params)
          .then(wrappedSuccess)
          .catch(wrappedFail);
      } else {
        // Try to invoke via capacitor's internal invoke
        // This is the Cordova plugin execution path
        console.log(`   🔌 Using capacitor invoke for Cordova plugin`);
        cordova.nativeCallback(callbackId, true, { 
          status: 'pending',
          message: 'Plugin call pending',
          raw: true
        });
        
        // Use postMessage to native if available
        if (window.Capacitor && typeof window.Capacitor.nativeChannel !== 'undefined') {
          window.Capacitor.nativeChannel.postMessage({
            type: 'plugin',
            pluginName: service,
            methodName: action,
            options: params,
            callbackId: callbackId
          });
        } else {
          throw new Error('No native channel available');
        }
      }
    } else {
      throw new Error('Capacitor.Plugins not available');
    }
  } catch (error) {
    console.error(`   ❌ Capacitor plugin invocation failed:`, error);
    if (fail) fail(error?.message || String(error));
  }
}

/**
 * Native callback from Capacitor/Cordova when plugin execution completes
 */
cordova.nativeCallback = function(callbackId, isSuccess, data) {
  console.log(`📲 Native callback: ${callbackId}, success: ${isSuccess}`);
  cordova.callback(callbackId, isSuccess, data);
};

// Expose cordova globally
window.cordova = cordova;
window._cordovaNative = cordova;

// Fire 'deviceready' event when document is ready
document.addEventListener('DOMContentLoaded', function() {
  console.log('📱 Firing deviceready event');
  document.dispatchEvent(new Event('deviceready'));
}, { once: true });

// Also fire if already loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
      console.log('📱 Firing deviceready event (late)');
      document.dispatchEvent(new Event('deviceready'));
    }, 100);
  }, { once: true });
} else {
  setTimeout(function() {
    console.log('📱 Firing deviceready event (immediate)');
    document.dispatchEvent(new Event('deviceready'));
  }, 100);
}

console.log('✅ Cordova bridge initialized');
