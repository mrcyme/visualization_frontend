<template>
  <div class="layer-control">
    <div class="control-header">
      <h3>🗺️ Layers</h3>
    </div>
    <div class="layer-list">
      <div 
        v-for="layer in layers" 
        :key="layer.id"
        class="layer-item"
        :class="{ active: layer.enabled }"
        @click="$emit('toggle-layer', layer.id)"
      >
        <span class="layer-icon">{{ layer.icon }}</span>
        <span class="layer-name">{{ layer.name }}</span>
        <span class="toggle-indicator">
          <svg 
            v-if="layer.enabled" 
            width="20" 
            height="20" 
            viewBox="0 0 20 20"
            fill="none"
          >
            <circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="2"/>
            <circle cx="10" cy="10" r="5" fill="currentColor"/>
          </svg>
          <svg 
            v-else 
            width="20" 
            height="20" 
            viewBox="0 0 20 20"
            fill="none"
          >
            <circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="2"/>
          </svg>
        </span>
      </div>
      <!-- WMS layer selector -->
      <div v-if="layers.find(l => l.id === 'wms')?.enabled" class="wms-selector">
        <label for="wmsLayer">WMS layer:</label>
        <select id="wmsLayer" v-model="localSelected">
          <option 
            v-for="l in availableWmsLayers" 
            :key="l.name" 
            :value="l.name"
          >{{ l.title }}</option>
        </select>
      </div>
    </div>
    <div class="control-footer">
      <small>Brussels Smart City</small>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  layers: {
    type: Array,
    required: true
  },
  availableWmsLayers: {
    type: Array,
    default: () => []
  },
  selectedWmsLayer: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['toggle-layer','update-wms-layer'])

const localSelected = computed({
  get: () => props.selectedWmsLayer,
  set: (val) => emit('update-wms-layer', val)
})
</script>

<style scoped>
.layer-control {
  position: absolute;
  top: 20px;
  left: 20px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  z-index: 10;
  min-width: 280px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
}

.control-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 15px 20px;
  border-bottom: 2px solid rgba(255, 255, 255, 0.2);
}

.control-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.layer-list {
  padding: 10px;
}

.layer-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 15px;
  margin: 5px 0;
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.layer-item:hover {
  transform: translateX(5px);
  border-color: #667eea;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.2);
}

.layer-item.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-color: #667eea;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.layer-icon {
  font-size: 24px;
  width: 30px;
  text-align: center;
  flex-shrink: 0;
}

.layer-name {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
}

.toggle-indicator {
  flex-shrink: 0;
  color: currentColor;
  opacity: 0.8;
}

.layer-item.active .toggle-indicator {
  opacity: 1;
}

.control-footer {
  padding: 10px 20px;
  background: rgba(0, 0, 0, 0.05);
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  text-align: center;
}

.control-footer small {
  color: #666;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.wms-selector {
  margin: 8px 10px 0 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.wms-selector label {
  font-size: 12px;
  color: #333;
  font-weight: 500;
}

.wms-selector select {
  width: 100%;
  padding: 8px;
  border-radius: 6px;
  border: 1px solid #ccc;
  font-size: 12px;
  background: white;
  cursor: pointer;
  transition: border-color 0.2s;
}

.wms-selector select:hover {
  border-color: #667eea;
}

.wms-selector select:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
}

@media (max-width: 768px) {
  .layer-control {
    top: 10px;
    left: 10px;
    right: 10px;
    min-width: unset;
  }
}
</style>



