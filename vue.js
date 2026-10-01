<template>
    <v-card class="mb-4">
        <v-card-title>
            <v-icon left>mdi-gamepad-variant</v-icon>
            Teach Pendant
        </v-card-title>

        <v-card-text>
            <v-row align="center" justify="center">
                <!-- X/Y Joystick Cluster -->
                <v-col cols="7" class="text-center">
                    <div class="text-subtitle-2 mb-2">X/Y Jog (mm)</div>

                    <v-btn-toggle v-model="jogStep" mandatory class="mb-4" dense>
                        <v-btn :value="0.1">0.1</v-btn>
                    <v-btn :value="1">1</v-btn>
                <v-btn :value="10">10</v-btn>
        </v-btn-toggle>

        <v-row justify="center" no-gutters>
            <v-btn icon large @click="jog('Y', 1)" color="primary">
            <v-icon>mdi-arrow-up-bold</v-icon>
        </v-btn>
    </v-row>
    <v-row justify="center" no-gutters class="my-2">
        <v-btn icon large @click="jog('X', -1)" color="primary" class="mr-6">
        <v-icon>mdi-arrow-left-bold</v-icon>
    </v-btn>
    <v-btn icon large @click="jog('X', 1)" color="primary" class="ml-6">
    <v-icon>mdi-arrow-right-bold</v-icon>
</v-btn>
          </v - row >
    <v-row justify="center" no-gutters>
        <v-btn icon large @click="jog('Y', -1)" color="primary">
        <v-icon>mdi-arrow-down-bold</v-icon>
    </v-btn>
          </v - row >
        </v - col >

        < !--Z Jog Cluster-- >
        <v-col cols="5" class="text-center">
          <div class="text-subtitle-2 mb-2">Z Jog</div>
          <v-row justify="center" no-gutters class="mb-8 mt-4">
            <v-btn icon large @click="jog('Z', 1)" color="secondary">
              <v-icon>mdi-arrow-up-bold</v-icon>
            </v-btn>
          </v-row>
          <v-row justify="center" no-gutters>
            <v-btn icon large @click="jog('Z', -1)" color="secondary">
              <v-icon>mdi-arrow-down-bold</v-icon>
            </v-btn>
          </v - row >
        </v - col >
      </v - row >

      <v-divider class="my-6"></v-divider>

      <!--Save Coordinates Input-- >
    <v-row align="center">
        <v-col cols="8">
            <v-text-field
                v-model="pointName"
                label="Location Name (e.g., dock_1)"
                hide-details
                dense
                outlined
            ></v-text-field>
        </v-col>
        <v-col cols="4">
            <v-btn color="success" block @click="saveLocation">
            <v-icon left>mdi-content-save</v-icon>
            Save
        </v-btn>
    </v-col>
      </v - row >
    </v - card - text >
  </v - card >
</template >

    <script>
        export default {
            name: 'TeachPendantPanel',
        data() {
    return {
            pointName: 'tool_dock_1',
        jogStep: 1, // Default to 1mm moves
        feedrate: 3000 // mm/min
    }
  },
        methods: {
            jog(axis, direction) {
      const distance = this.jogStep * direction;
        // Assemble relative move command 
        const gcode = `G91\nG1 ${axis}${distance} F${this.feedrate}\nG90`;

        // Dispatch directly to Klipper via Mainsail's server store
        this.$store.dispatch('server/sendGcode', gcode);
    },
        saveLocation() {
      if (!this.pointName) return;

        // Execute the Klipper macro to trigger the Python remote method backend
        const gcode = `SAVE_PENDANT_LOCATION NAME=${this.pointName}`;
        this.$store.dispatch('server/sendGcode', gcode);

        // Log the save action to the Mainsail console UI
        this.$store.commit('layout/addConsoleEntry', `Teach Pendant: Saving ${this.pointName}`);
    }
  }
}
    </script>